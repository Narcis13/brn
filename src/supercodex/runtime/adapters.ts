import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { fileExists, readJsonFile, readText, writeJsonFile, writeTextAtomic } from "../fs.js";
import { resolveRepoPath } from "../paths.js";
import { runCommand, cancelActiveRun, terminatePid } from "./process.js";
import { loadDispatchPacket, loadRuntimeRegistry, probeRuntimes } from "./registry.js";
import { ensureRunDirectory, collectRuntimeRun, createRunId, getRuntimeRunPaths, loadRuntimeRunHandle, resolveRunRef, saveNormalizedResult, saveRuntimeRunHandle } from "./runs.js";
import { runtimeModelResponseSchema, validateDispatchPacket, validateNormalizedResult, validateRuntimeModelResponse } from "./schemas.js";
import type {
  DispatchPacket,
  NormalizedResult,
  NormalizedStatus,
  RuntimeCapability,
  RuntimeCollectResult,
  RuntimeDispatchResult,
  RuntimeId,
  RuntimeModelResponse,
  RuntimeProbeResult,
  RuntimeRegistryEntry,
  RuntimeRunHandle,
} from "./types.js";

export interface RuntimeAdapter {
  readonly id: RuntimeId;
  readonly display_name: string;
  probe(root: string): Promise<RuntimeProbeResult>;
  dispatch(root: string, packet: DispatchPacket): Promise<RuntimeDispatchResult>;
  resume(root: string, runId: string, prompt?: string): Promise<RuntimeDispatchResult>;
  cancel(root: string, runId: string): Promise<boolean>;
  collect(root: string, runId: string): RuntimeCollectResult;
  supports(root: string, capability: RuntimeCapability): boolean;
}

interface AdapterExecutionPlan {
  session_id: string | null;
  args: string[];
  prompt: string;
}

interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  signal: NodeJS.Signals | null;
}

function gitAvailable(root: string): boolean {
  return existsSync(join(root, ".git"));
}

function listDirtyPaths(root: string): string[] {
  if (!gitAvailable(root)) {
    return [];
  }

  const runGit = (args: string[]): string[] => {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  return Array.from(
    new Set([
      ...runGit(["diff", "--name-only", "--relative", "HEAD"]),
      ...runGit(["ls-files", "--others", "--exclude-standard"]),
    ]),
  ).sort();
}

function difference(after: string[], before: string[]): string[] {
  const baseline = new Set(before);
  return after.filter((path) => !baseline.has(path));
}

function renderDispatchPrompt(packet: DispatchPacket): string {
  return [
    "You are executing one SUPER_CODEX dispatch packet.",
    "Follow the packet exactly and return JSON only.",
    "Return a JSON object with these fields:",
    '- `status`: "success" | "failed" | "blocked" | "interrupted"',
    "- `summary`: concise result summary",
    "- `tests_written`: array of tests added",
    "- `tests_run`: array of tests or checks executed",
    "- `verification_evidence`: array of evidence statements",
    "- `assumptions`: array of assumptions made",
    "- `blockers`: array of blockers encountered",
    "- `followups`: array of follow-up actions",
    "",
    "Dispatch packet:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
}

function renderResumePrompt(packet: DispatchPacket, prompt?: string): string {
  return [
    "Continue the existing SUPER_CODEX runtime session for the same unit.",
    "Return JSON only using the same response schema as before.",
    prompt?.trim() ? `Operator follow-up: ${prompt.trim()}` : "Operator follow-up: Continue and report the current state precisely.",
    "",
    "Original dispatch packet:",
    JSON.stringify(packet, null, 2),
  ].join("\n");
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function looksLikeModelResponse(value: unknown): value is RuntimeModelResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "string" && typeof candidate.summary === "string";
}

function extractCandidates(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      return [JSON.parse(value), value];
    } catch {
      return [value];
    }
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  const results: unknown[] = [value];

  for (const key of ["result", "message", "payload", "data", "text"]) {
    if (key in candidate) {
      results.push(candidate[key]);
    }
  }

  if (Array.isArray(candidate.content)) {
    for (const item of candidate.content) {
      results.push(item);
      if (item && typeof item === "object" && "text" in (item as Record<string, unknown>)) {
        results.push((item as Record<string, unknown>).text);
      }
    }
  }

  return results;
}

function tryParseModelResponse(...texts: string[]): RuntimeModelResponse | null {
  const queue: unknown[] = texts.filter(Boolean);

  while (queue.length > 0) {
    const next = queue.shift();
    if (typeof next === "string") {
      try {
        queue.push(JSON.parse(next));
      } catch {
        continue;
      }
      continue;
    }

    if (looksLikeModelResponse(next)) {
      const response: RuntimeModelResponse = {
        status: next.status as RuntimeModelResponse["status"],
        summary: String(next.summary).trim(),
        tests_written: coerceStringArray(next.tests_written),
        tests_run: coerceStringArray(next.tests_run),
        verification_evidence: coerceStringArray(next.verification_evidence),
        assumptions: coerceStringArray(next.assumptions),
        blockers: coerceStringArray(next.blockers),
        followups: coerceStringArray(next.followups),
      };

      validateRuntimeModelResponse(response);
      return response;
    }

    queue.push(...extractCandidates(next));
  }

  return null;
}

function extractSessionId(...texts: string[]): string | null {
  const keys = new Set(["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId"]);
  const queue: unknown[] = [...texts.filter(Boolean)];

  while (queue.length > 0) {
    const next = queue.shift();
    if (typeof next === "string") {
      try {
        queue.push(JSON.parse(next));
      } catch {
        continue;
      }
      continue;
    }

    if (!next || typeof next !== "object") {
      continue;
    }

    const candidate = next as Record<string, unknown>;
    for (const [key, value] of Object.entries(candidate)) {
      if (keys.has(key) && typeof value === "string" && value.trim()) {
        return value.trim();
      }
      queue.push(value);
    }
  }

  return null;
}

function summarizeFallback(exitCode: number, responseText: string, stderr: string): string {
  const responseLine = responseText.trim().split("\n").find(Boolean);
  if (responseLine) {
    return responseLine.slice(0, 500);
  }

  const stderrLine = stderr.trim().split("\n").find(Boolean);
  if (stderrLine) {
    return stderrLine.slice(0, 500);
  }

  return exitCode === 0 ? "Runtime completed without a structured summary." : `Runtime exited with code ${exitCode}.`;
}

function deriveStatus(exitCode: number, signal: NodeJS.Signals | null, candidate: RuntimeModelResponse | null): NormalizedStatus {
  if (signal) {
    return "interrupted";
  }

  if (candidate?.status === "blocked") {
    return "blocked";
  }

  if (candidate?.status === "interrupted") {
    return "interrupted";
  }

  if (exitCode === 0) {
    return candidate?.status ?? "success";
  }

  return "failed";
}

function normalizeResult(params: {
  run_id: string;
  runtime: RuntimeId;
  response_text: string;
  stdout: string;
  stderr: string;
  raw_ref: string;
  exit_code: number;
  signal: NodeJS.Signals | null;
  started_at: string;
  completed_at: string;
  session_id: string | null;
  files_changed: string[];
}): NormalizedResult {
  const candidate = tryParseModelResponse(params.response_text, params.stdout, params.stderr);
  const normalized: NormalizedResult = {
    run_id: params.run_id,
    runtime: params.runtime,
    status: deriveStatus(params.exit_code, params.signal, candidate),
    summary: candidate?.summary ?? summarizeFallback(params.exit_code, params.response_text, params.stderr),
    files_changed: params.files_changed,
    tests_written: candidate?.tests_written ?? [],
    tests_run: candidate?.tests_run ?? [],
    verification_evidence: candidate?.verification_evidence ?? [],
    assumptions: candidate?.assumptions ?? [],
    blockers: candidate?.blockers ?? [],
    followups: candidate?.followups ?? [],
    raw_ref: params.raw_ref,
    exit_code: params.exit_code,
    started_at: params.started_at,
    completed_at: params.completed_at,
    session_id: params.session_id,
  };

  validateNormalizedResult(normalized);
  return normalized;
}

function resolveEntry(root: string, runtime: RuntimeId): RuntimeRegistryEntry {
  const registry = loadRuntimeRegistry(root);
  const entry = registry.runtimes[runtime];
  if (!entry.enabled) {
    throw new Error(`Runtime ${runtime} is disabled in ${resolveRepoPath(root, ".supercodex/runtime/adapters.json")}.`);
  }

  if (!entry.configured) {
    throw new Error(`Runtime ${runtime} is not configured in ${resolveRepoPath(root, ".supercodex/runtime/adapters.json")}.`);
  }

  return entry;
}

abstract class BaseRuntimeAdapter implements RuntimeAdapter {
  readonly id: RuntimeId;
  readonly display_name: string;

  protected constructor(id: RuntimeId, displayName: string) {
    this.id = id;
    this.display_name = displayName;
  }

  async probe(root: string): Promise<RuntimeProbeResult> {
    const [probe] = await probeRuntimes(root, this.id);
    return probe;
  }

  supports(root: string, capability: RuntimeCapability): boolean {
    return resolveEntry(root, this.id).capabilities.includes(capability);
  }

  collect(root: string, runId: string): RuntimeCollectResult {
    return collectRuntimeRun(root, runId);
  }

  async cancel(root: string, runId: string): Promise<boolean> {
    if (cancelActiveRun(runId)) {
      return true;
    }

    const handle = loadRuntimeRunHandle(root, runId);
    if (!handle.pid) {
      return false;
    }

    const cancelled = terminatePid(handle.pid);
    if (cancelled) {
      const updated: RuntimeRunHandle = {
        ...handle,
        status: "cancelled",
        completed_at: new Date().toISOString(),
      };
      saveRuntimeRunHandle(root, updated);
    }

    return cancelled;
  }

  async dispatch(root: string, packet: DispatchPacket): Promise<RuntimeDispatchResult> {
    return await this.execute(root, packet, null, renderDispatchPrompt(packet));
  }

  async resume(root: string, runId: string, prompt?: string): Promise<RuntimeDispatchResult> {
    const handle = loadRuntimeRunHandle(root, runId);
    if (handle.runtime !== this.id) {
      throw new Error(`Run ${runId} belongs to ${handle.runtime}, not ${this.id}.`);
    }

    if (!handle.session_id) {
      throw new Error(`Run ${runId} does not have a captured runtime session id, so resume is unavailable.`);
    }

    const packet = loadDispatchPacket(resolveRunRef(root, handle.packet_ref));
    return await this.execute(root, packet, runId, renderResumePrompt(packet, prompt), handle.session_id);
  }

  protected abstract buildDispatchPlan(
    root: string,
    entry: RuntimeRegistryEntry,
    prompt: string,
    runPaths: ReturnType<typeof getRuntimeRunPaths>,
    sessionId: string | null,
    isResume: boolean,
  ): AdapterExecutionPlan;

  private async execute(
    root: string,
    packet: DispatchPacket,
    parentRunId: string | null,
    prompt: string,
    resumeSessionId: string | null = null,
  ): Promise<RuntimeDispatchResult> {
    validateDispatchPacket(packet);
    const entry = resolveEntry(root, this.id);
    const started_at = new Date().toISOString();
    const run_id = createRunId(this.id, packet.unit_id, started_at);
    const runPaths = ensureRunDirectory(root, run_id);
    const plan = this.buildDispatchPlan(root, entry, prompt, runPaths, resumeSessionId, parentRunId !== null);
    const beforeDirty = listDirtyPaths(root);

    writeJsonFile(resolveRunRef(root, runPaths.packet_ref), packet);
    writeTextAtomic(resolveRunRef(root, runPaths.prompt_ref), `${prompt}\n`);
    writeJsonFile(resolveRunRef(root, runPaths.schema_ref), runtimeModelResponseSchema);

    let handle: RuntimeRunHandle = {
      version: 1,
      run_id,
      runtime: this.id,
      parent_run_id: parentRunId,
      session_id: plan.session_id,
      command: entry.command,
      args: plan.args,
      cwd: root,
      packet_ref: runPaths.packet_ref,
      prompt_ref: runPaths.prompt_ref,
      response_ref: runPaths.response_ref,
      stdout_ref: runPaths.stdout_ref,
      stderr_ref: runPaths.stderr_ref,
      normalized_ref: runPaths.normalized_ref,
      started_at,
      completed_at: null,
      exit_code: null,
      status: "running",
      pid: null,
    };
    saveRuntimeRunHandle(root, handle);

    let commandOutput: CommandOutput;
    try {
      commandOutput = await runCommand({
        command: entry.command,
        args: plan.args,
        cwd: root,
        run_id,
        on_spawn: (pid) => {
          handle = {
            ...handle,
            pid,
          };
          saveRuntimeRunHandle(root, handle);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeTextAtomic(resolveRunRef(root, runPaths.stderr_ref), `${message}\n`);
      throw error;
    }

    const completed_at = new Date().toISOString();
    writeTextAtomic(resolveRunRef(root, runPaths.stdout_ref), commandOutput.stdout);
    writeTextAtomic(resolveRunRef(root, runPaths.stderr_ref), commandOutput.stderr);

    const responseText = fileExists(resolveRunRef(root, runPaths.response_ref))
      ? readText(resolveRunRef(root, runPaths.response_ref))
      : commandOutput.stdout;
    writeTextAtomic(resolveRunRef(root, runPaths.response_ref), responseText);

    const session_id = plan.session_id ?? extractSessionId(commandOutput.stdout, responseText, commandOutput.stderr);
    const files_changed = difference(listDirtyPaths(root), beforeDirty);
    const result = normalizeResult({
      run_id,
      runtime: this.id,
      response_text: responseText,
      stdout: commandOutput.stdout,
      stderr: commandOutput.stderr,
      raw_ref: runPaths.response_ref,
      exit_code: commandOutput.exit_code,
      signal: commandOutput.signal,
      started_at,
      completed_at,
      session_id,
      files_changed,
    });
    saveNormalizedResult(root, result);

    handle = {
      ...handle,
      session_id,
      completed_at,
      exit_code: commandOutput.exit_code,
      status: commandOutput.exit_code === 0 ? "completed" : "failed",
    };
    saveRuntimeRunHandle(root, handle);

    return {
      handle,
      result,
    };
  }
}

class CodexAdapter extends BaseRuntimeAdapter {
  constructor() {
    super("codex", "Codex");
  }

  protected buildDispatchPlan(
    root: string,
    entry: RuntimeRegistryEntry,
    prompt: string,
    runPaths: ReturnType<typeof getRuntimeRunPaths>,
    sessionId: string | null,
    isResume: boolean,
  ): AdapterExecutionPlan {
    const baseArgs = ["-C", root, ...(entry.default_args ?? []), "exec"];
    const execArgs = isResume
      ? [
          "resume",
          "--json",
          "--output-last-message",
          resolveRunRef(root, runPaths.response_ref),
          "--output-schema",
          resolveRunRef(root, runPaths.schema_ref),
          ...(sessionId ? [sessionId] : []),
          prompt,
        ]
      : [
          "--skip-git-repo-check",
          "--json",
          "--output-last-message",
          resolveRunRef(root, runPaths.response_ref),
          "--output-schema",
          resolveRunRef(root, runPaths.schema_ref),
          prompt,
        ];

    return {
      session_id: sessionId,
      args: [...baseArgs, ...execArgs],
      prompt,
    };
  }
}

class ClaudeAdapter extends BaseRuntimeAdapter {
  constructor() {
    super("claude", "Claude Code");
  }

  protected buildDispatchPlan(
    _root: string,
    entry: RuntimeRegistryEntry,
    prompt: string,
    _runPaths: ReturnType<typeof getRuntimeRunPaths>,
    sessionId: string | null,
    isResume: boolean,
  ): AdapterExecutionPlan {
    const effectiveSessionId = sessionId ?? randomUUID();
    const args = [
      ...(entry.default_args ?? []),
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(runtimeModelResponseSchema),
      ...(isResume ? ["-r", effectiveSessionId] : ["--session-id", effectiveSessionId]),
      prompt,
    ];

    return {
      session_id: effectiveSessionId,
      args,
      prompt,
    };
  }
}

const adapters: Record<RuntimeId, RuntimeAdapter> = {
  claude: new ClaudeAdapter(),
  codex: new CodexAdapter(),
};

export function getRuntimeAdapter(runtime: RuntimeId): RuntimeAdapter {
  return adapters[runtime];
}
