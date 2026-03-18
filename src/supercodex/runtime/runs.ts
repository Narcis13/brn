import { ensureDirectory, fileExists, readJsonFile, writeJsonFile } from "../fs.js";
import { joinPath } from "../fs.js";
import { resolveRepoPath } from "../paths.js";
import { validateNormalizedResult, validateRuntimeRunHandle } from "./schemas.js";
import { RUNTIME_TEMP_DIR } from "./registry.js";
import type { NormalizedResult, RuntimeCollectResult, RuntimeId, RuntimeRunHandle } from "./types.js";

export interface RuntimeRunPaths {
  dir: string;
  handle_ref: string;
  packet_ref: string;
  prompt_ref: string;
  response_ref: string;
  stdout_ref: string;
  stderr_ref: string;
  normalized_ref: string;
  schema_ref: string;
}

function compactTimestamp(timestamp: string): string {
  return timestamp.replace(/[-:TZ.]/g, "").slice(0, 17);
}

function slugifyUnitId(unitId: string): string {
  return unitId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function createRunId(runtime: RuntimeId, unitId: string, timestamp = new Date().toISOString()): string {
  return `${compactTimestamp(timestamp)}-${runtime}-${slugifyUnitId(unitId)}`;
}

export function getRuntimeRunPaths(root: string, runId: string): RuntimeRunPaths {
  const dir = `${RUNTIME_TEMP_DIR}/${runId}`;
  return {
    dir,
    handle_ref: `${dir}/handle.json`,
    packet_ref: `${dir}/packet.json`,
    prompt_ref: `${dir}/prompt.md`,
    response_ref: `${dir}/response.json`,
    stdout_ref: `${dir}/stdout.log`,
    stderr_ref: `${dir}/stderr.log`,
    normalized_ref: `${dir}/normalized.json`,
    schema_ref: `${dir}/response.schema.json`,
  };
}

export function ensureRunDirectory(root: string, runId: string): RuntimeRunPaths {
  const paths = getRuntimeRunPaths(root, runId);
  ensureDirectory(resolveRepoPath(root, paths.dir));
  return paths;
}

export function saveRuntimeRunHandle(root: string, handle: RuntimeRunHandle): void {
  validateRuntimeRunHandle(handle);
  writeJsonFile(resolveRepoPath(root, getRuntimeRunPaths(root, handle.run_id).handle_ref), handle);
}

export function loadRuntimeRunHandle(root: string, runId: string): RuntimeRunHandle {
  const handle = readJsonFile<RuntimeRunHandle>(resolveRepoPath(root, getRuntimeRunPaths(root, runId).handle_ref));
  validateRuntimeRunHandle(handle);
  return handle;
}

export function saveNormalizedResult(root: string, result: NormalizedResult): void {
  validateNormalizedResult(result);
  writeJsonFile(resolveRepoPath(root, getRuntimeRunPaths(root, result.run_id).normalized_ref), result);
}

export function loadNormalizedResult(root: string, runId: string): NormalizedResult {
  const result = readJsonFile<NormalizedResult>(resolveRepoPath(root, getRuntimeRunPaths(root, runId).normalized_ref));
  validateNormalizedResult(result);
  return result;
}

export function collectRuntimeRun(root: string, runId: string): RuntimeCollectResult {
  const handle = loadRuntimeRunHandle(root, runId);
  const normalizedPath = resolveRepoPath(root, getRuntimeRunPaths(root, runId).normalized_ref);

  if (!fileExists(normalizedPath)) {
    return {
      handle,
      result: null,
    };
  }

  return {
    handle,
    result: loadNormalizedResult(root, runId),
  };
}

export function resolveRunRef(root: string, relativePath: string): string {
  return resolveRepoPath(root, relativePath);
}
