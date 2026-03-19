import { listFiles, readJsonFile, writeJsonFile, writeTextAtomic, fileExists, readText } from "../fs.js";
import { resolveRepoPath } from "../paths.js";
import { validateCanonicalRunRecord, validateContextManifest, validateNextActionDecision } from "./schemas.js";
import type { CanonicalRunRecord, ContextManifest, NextActionDecision } from "./types.js";

export const CANONICAL_RUNS_DIR = ".supercodex/runs";

export interface CanonicalRunPaths {
  dir: string;
  record_ref: string;
  decision_ref: string;
  context_ref: string;
  packet_ref: string;
  prompt_ref: string;
  state_ref: string;
  continuation_ref: string;
  continuation_json_ref: string;
  recovery_ref: string;
  checkpoints_dir: string;
  handle_ref: string;
  normalized_ref: string;
}

export function getCanonicalRunPaths(runId: string): CanonicalRunPaths {
  const dir = `${CANONICAL_RUNS_DIR}/${runId}`;
  return {
    dir,
    record_ref: `${dir}/record.json`,
    decision_ref: `${dir}/decision.json`,
    context_ref: `${dir}/context.json`,
    packet_ref: `${dir}/packet.json`,
    prompt_ref: `${dir}/prompt.md`,
    state_ref: `${dir}/state.json`,
    continuation_ref: `${dir}/continue.md`,
    continuation_json_ref: `${dir}/continuation.json`,
    recovery_ref: `${dir}/recovery.json`,
    checkpoints_dir: `${dir}/checkpoints`,
    handle_ref: `${dir}/handle.json`,
    normalized_ref: `${dir}/normalized.json`,
  };
}

export function saveNextActionDecisionFile(root: string, runId: string, decision: NextActionDecision): string {
  validateNextActionDecision(decision);
  const ref = getCanonicalRunPaths(runId).decision_ref;
  writeJsonFile(resolveRepoPath(root, ref), decision);
  return ref;
}

export function saveContextManifestFile(root: string, runId: string, manifest: ContextManifest): string {
  validateContextManifest(manifest);
  const ref = getCanonicalRunPaths(runId).context_ref;
  writeJsonFile(resolveRepoPath(root, ref), manifest);
  return ref;
}

export function savePromptFile(root: string, runId: string, prompt: string): string {
  const ref = getCanonicalRunPaths(runId).prompt_ref;
  writeTextAtomic(resolveRepoPath(root, ref), `${prompt}\n`);
  return ref;
}

export function saveCanonicalRunRecord(root: string, record: CanonicalRunRecord): void {
  validateCanonicalRunRecord(record);
  writeJsonFile(resolveRepoPath(root, getCanonicalRunPaths(record.run_id).record_ref), record);
}

export function loadCanonicalRunRecord(root: string, runId: string): CanonicalRunRecord {
  const record = readJsonFile<CanonicalRunRecord>(resolveRepoPath(root, getCanonicalRunPaths(runId).record_ref));
  validateCanonicalRunRecord(record);
  return record;
}

export function listCanonicalRunRecords(root: string): CanonicalRunRecord[] {
  const runRoot = resolveRepoPath(root, CANONICAL_RUNS_DIR);
  return listFiles(runRoot)
    .filter((entry) => fileExists(resolveRepoPath(root, `${CANONICAL_RUNS_DIR}/${entry}/record.json`)))
    .map((entry) => loadCanonicalRunRecord(root, entry))
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
}

export function listCanonicalRunRecordsForUnit(root: string, unitId: string): CanonicalRunRecord[] {
  return listCanonicalRunRecords(root).filter((record) => record.unit_id === unitId);
}

export function loadLatestCanonicalRunForUnit(root: string, unitId: string): CanonicalRunRecord | null {
  return listCanonicalRunRecordsForUnit(root, unitId).at(-1) ?? null;
}

export function saveStateSnapshot(root: string, runId: string, state: unknown): string {
  const ref = getCanonicalRunPaths(runId).state_ref;
  writeJsonFile(resolveRepoPath(root, ref), state);
  return ref;
}

export function saveContinuation(root: string, runId: string, content: string): string {
  const ref = getCanonicalRunPaths(runId).continuation_ref;
  writeTextAtomic(resolveRepoPath(root, ref), `${content.trimEnd()}\n`);
  return ref;
}

export function copyFileIntoCanonicalRun(root: string, sourceRef: string, destinationRef: string): string {
  const content = readText(resolveRepoPath(root, sourceRef));
  writeTextAtomic(resolveRepoPath(root, destinationRef), content);
  return destinationRef;
}
