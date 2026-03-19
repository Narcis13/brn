import { fileExists, listFiles, readJsonFile, writeJsonFile, writeTextAtomic } from "../fs.js";
import { parseUnitId } from "../planning/index.js";
import { resolveRepoPath } from "../paths.js";
import { getRuntimeAdapter } from "../runtime/adapters.js";
import { loadRuntimeRunHandle } from "../runtime/runs.js";
import type { DispatchPacket, NormalizedResult, RuntimeId } from "../runtime/types.js";
import { reconcileState, loadCurrentState, loadQueueState, saveCurrentState, transitionState } from "../state.js";
import { getCanonicalRunPaths, listCanonicalRunRecords, loadCanonicalRunRecord } from "../synth/runs.js";
import type { CanonicalRunGitSnapshot, NextActionDecision } from "../synth/types.js";
import { getTaskVerificationState } from "../verify/index.js";
import { runPostmortem } from "../audit/index.js";
import { validateContinuationPacket, validateRecoveryAssessment, validateRecoveryCheckpoint } from "./schemas.js";
import type {
  ContinuationPacket,
  RecoveryAssessment,
  RecoveryCheckpoint,
  RecoveryCheckpointKind,
  RecoveryDrift,
  RecoveryRecommendation,
} from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function matchesGitBoundary(current: CanonicalRunGitSnapshot, expected: CanonicalRunGitSnapshot): boolean {
  return (
    current.task_branch === expected.task_branch &&
    current.worktree_path === expected.worktree_path &&
    current.base_commit === expected.base_commit &&
    current.head_commit === expected.head_commit &&
    current.dirty === expected.dirty
  );
}

function gitSnapshotFromState(root: string): CanonicalRunGitSnapshot {
  const current = loadCurrentState(root);
  return {
    trunk_branch: current.git.trunk_branch,
    milestone_branch: current.git.milestone_branch,
    task_branch: current.git.task_branch,
    worktree_path: current.git.worktree_path,
    base_commit: current.git.base_commit,
    head_commit: current.git.head_commit,
    dirty: current.git.dirty,
  };
}

function checkpointRef(root: string, runId: string, kind: RecoveryCheckpointKind): string {
  const paths = getCanonicalRunPaths(runId);
  const count = listFiles(resolveRepoPath(root, paths.checkpoints_dir)).filter((entry) => entry.endsWith(".json")).length + 1;
  const name = `${String(count).padStart(3, "0")}-${kind.replaceAll("_", "-")}.json`;
  return `${paths.checkpoints_dir}/${name}`;
}

function drift(code: string, severity: RecoveryDrift["severity"], message: string, ref: string | null = null): RecoveryDrift {
  return {
    code,
    severity,
    message,
    ref,
  };
}

function appendMetric(root: string, field: "recovery_mismatches", amount: number): void {
  if (amount <= 0) {
    return;
  }

  const current = loadCurrentState(root);
  saveCurrentState(root, {
    ...current,
    metrics: {
      ...current.metrics,
      [field]: current.metrics[field] + amount,
    },
  });
}

function transitionIfNeeded(root: string, phase: "recover" | "plan" | "blocked" | "awaiting_human", reason: string, unitId: string): void {
  if (loadCurrentState(root).phase === phase) {
    return;
  }

  transitionState(root, phase, reason, unitId, "recover");
}

function pinRecoveryTarget(root: string, runId: string, runtime: RuntimeId, unitId: string | null): void {
  const current = loadCurrentState(root);
  const parsed = unitId ? parseUnitId(unitId) : { milestone_id: null, slice_id: null, task_id: null };
  saveCurrentState(root, {
    ...current,
    active_runtime: runtime,
    active_milestone: parsed.milestone_id,
    active_slice: parsed.slice_id,
    active_task: parsed.task_id,
    current_run_id: runId,
    recovery_ref: getCanonicalRunPaths(runId).continuation_ref,
  });
}

function recommendationSummary(recommendation: RecoveryRecommendation, runId: string): string {
  switch (recommendation) {
    case "resume":
      return `Resume ${runId} from the captured runtime session.`;
    case "dispatch":
      return `Resume is unsafe for ${runId}; create a fresh attempt for the same unit.`;
    case "retry":
      return `Retry ${runId}'s unit from a fresh attempt.`;
    case "replan":
      return `Run ${runId} drifted too far from current disk truth and should return to plan.`;
    case "await_human":
      return `Run ${runId} cannot continue safely without human input.`;
    case "restart":
      return `Run ${runId} should be restarted from a fresh base.`;
    default:
      return `No recovery action is required for ${runId}.`;
  }
}

function blockingDrifts(drifts: RecoveryDrift[]): RecoveryDrift[] {
  return drifts.filter((entry) => entry.severity === "blocking");
}

function resolveTargetTaskStatus(unitType: string): "implement" | "verify" | "review" | null {
  if (unitType === "task") {
    return "implement";
  }
  if (unitType === "verification") {
    return "verify";
  }
  if (unitType === "review") {
    return "review";
  }
  return null;
}

function resolveRecoveryRunId(root: string, requestedRunId?: string): string {
  if (requestedRunId) {
    return requestedRunId;
  }

  const current = loadCurrentState(root);
  if (current.current_run_id) {
    return current.current_run_id;
  }

  if (current.recovery_ref) {
    const match = /\.supercodex\/runs\/([^/]+)\/continue\.md$/.exec(current.recovery_ref);
    if (match?.[1]) {
      return match[1];
    }
  }

  const latest = listCanonicalRunRecords(root).at(-1);
  if (latest) {
    return latest.run_id;
  }

  throw new Error("No recovery target run is available.");
}

export function buildContinuationPacket(
  runId: string,
  decision: Pick<NextActionDecision, "action" | "runtime">,
  packet: Pick<DispatchPacket, "unit_id" | "objective" | "files_in_scope">,
  result: NormalizedResult | null,
): ContinuationPacket {
  const continuation: ContinuationPacket = {
    version: 1,
    run_id: runId,
    unit_id: packet.unit_id,
    action: decision.action,
    runtime: decision.runtime ?? null,
    status: result?.status ?? "pending",
    objective: packet.objective,
    completed: result?.summary ? [result.summary] : ["Dispatch packet was persisted and execution context was assembled."],
    remaining: result?.followups.length
      ? [...result.followups]
      : ["Review the normalized result and continue with the next deterministic phase."],
    best_hypothesis: result?.summary ?? "The unit is ready for execution.",
    first_next_step:
      result?.status === "interrupted"
        ? "Resume the latest runtime session if it still matches disk state."
        : "Inspect the canonical run record and continue from the recorded evidence.",
    files_in_play: [...packet.files_in_scope],
    known_pitfalls: result?.blockers.length
      ? [...result.blockers]
      : ["Do not treat this run as verified completion without explicit evidence."],
    generated_at: new Date().toISOString(),
  };

  validateContinuationPacket(continuation);
  return continuation;
}

export function renderContinuationMarkdown(packet: ContinuationPacket): string {
  return [
    "# Continue",
    "",
    `- Unit objective: ${packet.objective}`,
    `- Action: ${packet.action}`,
    `- Runtime: ${packet.runtime ?? "unassigned"}`,
    `- Status: ${packet.status}`,
    "",
    "## Completed",
    ...packet.completed.map((entry) => `- ${entry}`),
    "",
    "## Remaining",
    ...packet.remaining.map((entry) => `- ${entry}`),
    "",
    "## Current best hypothesis",
    `- ${packet.best_hypothesis}`,
    "",
    "## Exact first next step",
    `- ${packet.first_next_step}`,
    "",
    "## Files in play",
    ...packet.files_in_play.map((entry) => `- ${entry}`),
    "",
    "## Known pitfalls",
    ...packet.known_pitfalls.map((entry) => `- ${entry}`),
  ].join("\n");
}

export function saveContinuationArtifacts(root: string, runId: string, continuation: ContinuationPacket): void {
  validateContinuationPacket(continuation);
  const paths = getCanonicalRunPaths(runId);
  writeJsonFile(resolveRepoPath(root, paths.continuation_json_ref), continuation);
  writeTextAtomic(resolveRepoPath(root, paths.continuation_ref), `${renderContinuationMarkdown(continuation).trimEnd()}\n`);
}

export function writeRecoveryCheckpoint(
  root: string,
  runId: string,
  kind: RecoveryCheckpointKind,
  summary: string,
  unitId: string | null,
  runtime: RuntimeId | null,
): string {
  const paths = getCanonicalRunPaths(runId);
  const checkpoint: RecoveryCheckpoint = {
    version: 1,
    run_id: runId,
    kind,
    unit_id: unitId,
    phase: loadCurrentState(root).phase,
    runtime,
    state_ref: paths.state_ref,
    continuation_ref: paths.continuation_ref,
    git: gitSnapshotFromState(root),
    summary,
    created_at: new Date().toISOString(),
  };
  validateRecoveryCheckpoint(checkpoint);
  const ref = checkpointRef(root, runId, kind);
  writeJsonFile(resolveRepoPath(root, ref), checkpoint);
  return ref;
}

export function loadRecoveryAssessment(root: string, runId: string): RecoveryAssessment | null {
  const ref = resolveRepoPath(root, getCanonicalRunPaths(runId).recovery_ref);
  if (!fileExists(ref)) {
    return null;
  }

  const assessment = readJsonFile<RecoveryAssessment>(ref);
  validateRecoveryAssessment(assessment);
  return assessment;
}

export function saveRecoveryAssessment(root: string, assessment: RecoveryAssessment): string {
  validateRecoveryAssessment(assessment);
  const ref = getCanonicalRunPaths(assessment.run_id).recovery_ref;
  writeJsonFile(resolveRepoPath(root, ref), assessment);
  return ref;
}

export function assessRecovery(root: string, requestedRunId?: string): RecoveryAssessment {
  const runId = resolveRecoveryRunId(root, requestedRunId);
  const current = reconcileState(root);
  const record = loadCanonicalRunRecord(root, runId);
  const paths = getCanonicalRunPaths(runId);
  const refs = unique([
    paths.record_ref,
    paths.packet_ref,
    paths.continuation_ref,
    paths.continuation_json_ref,
    current.recovery_ref ?? "",
  ]);
  const drifts: RecoveryDrift[] = [];
  const queueItem = loadQueueState(root).items.find((item) => item.unit_id === record.unit_id) ?? null;

  if (!fileExists(resolveRepoPath(root, paths.packet_ref))) {
    drifts.push(drift("missing_packet", "blocking", `Run ${runId} is missing its canonical packet.`, paths.packet_ref));
  }
  if (!fileExists(resolveRepoPath(root, paths.continuation_ref))) {
    drifts.push(drift("missing_continuation_markdown", "warning", `Run ${runId} is missing continue.md.`, paths.continuation_ref));
  }
  if (!fileExists(resolveRepoPath(root, paths.continuation_json_ref))) {
    drifts.push(drift("missing_continuation_packet", "warning", `Run ${runId} is missing continuation.json.`, paths.continuation_json_ref));
  }
  if (queueItem?.status === "done") {
    drifts.push(drift("unit_already_done", "blocking", `Unit ${record.unit_id} is already marked done in the queue.`, null));
  }
  if (!queueItem) {
    drifts.push(drift("unit_missing_from_queue", "warning", `Unit ${record.unit_id} is not present in queue.json.`, ".supercodex/state/queue.json"));
  }

  const desiredTaskStatus = resolveTargetTaskStatus(record.unit_type);
  if (desiredTaskStatus && parseUnitId(record.unit_id).kind === "task") {
    const verificationState = getTaskVerificationState(root, record.unit_id);
    if (verificationState.status !== desiredTaskStatus) {
      drifts.push(
        drift(
          "task_state_advanced",
          "blocking",
          `Task ${record.unit_id} is now in ${verificationState.status}, not ${desiredTaskStatus}.`,
          ".supercodex/verify",
        ),
      );
    }
  }

  if (record.status === "running") {
    drifts.push(drift("run_still_running", "blocking", `Run ${runId} is still marked running.`, paths.handle_ref));
  }

  let canResume = false;
  if (record.status === "interrupted") {
    const resumeSupported = getRuntimeAdapter(record.runtime).supports(root, "resume");
    if (!resumeSupported) {
      drifts.push(drift("runtime_cannot_resume", "blocking", `Runtime ${record.runtime} does not support resume.`, null));
    }

    try {
      const handle = loadRuntimeRunHandle(root, runId);
      if (!handle.session_id) {
        drifts.push(drift("missing_session_id", "blocking", `Run ${runId} has no captured session id.`, paths.handle_ref));
      }
    } catch {
      drifts.push(drift("missing_runtime_handle", "blocking", `Run ${runId} is missing handle.json.`, paths.handle_ref));
    }

    const expectedGit = record.git_after ?? record.git_before;
    if (!matchesGitBoundary(gitSnapshotFromState(root), expectedGit)) {
      drifts.push(
        drift(
          "git_drift",
          "blocking",
          `Git state moved away from run ${runId}'s recorded boundary.`,
          ".supercodex/state/current.json",
        ),
      );
    }

    canResume = blockingDrifts(drifts).length === 0;
  }

  let recommendation: RecoveryRecommendation = "none";
  if (record.status === "blocked" || current.blocked || current.awaiting_human) {
    recommendation = "await_human";
  } else if (record.status === "interrupted") {
    if (canResume) {
      recommendation = "resume";
    } else if (queueItem && queueItem.status !== "done") {
      recommendation = blockingDrifts(drifts).some((entry) => entry.code === "task_state_advanced") ? "replan" : "dispatch";
    } else {
      recommendation = "replan";
    }
  } else if (record.status === "failed") {
    recommendation = queueItem && queueItem.status !== "done" ? "retry" : "replan";
  }

  const assessment: RecoveryAssessment = {
    version: 1,
    run_id: runId,
    unit_id: record.unit_id,
    current_phase: current.phase,
    latest_status: record.status,
    recommendation,
    can_resume: recommendation === "resume",
    summary: recommendationSummary(recommendation, runId),
    drifts,
    refs,
    generated_at: new Date().toISOString(),
  };

  validateRecoveryAssessment(assessment);
  return assessment;
}

export function reconcileRecovery(root: string, requestedRunId?: string): RecoveryAssessment {
  const runId = resolveRecoveryRunId(root, requestedRunId);
  const record = loadCanonicalRunRecord(root, runId);
  writeRecoveryCheckpoint(root, runId, "pre_reconcile", `Preparing recovery reconcile for ${record.unit_id}.`, record.unit_id, record.runtime);

  const assessment = assessRecovery(root, runId);
  saveRecoveryAssessment(root, assessment);
  pinRecoveryTarget(root, runId, record.runtime, record.unit_id);

  const blocking = blockingDrifts(assessment.drifts);
  appendMetric(root, "recovery_mismatches", blocking.length);

  if (!record.unit_id) {
    return assessment;
  }

  if (assessment.recommendation === "await_human") {
    transitionIfNeeded(
      root,
      record.status === "blocked" ? "blocked" : "awaiting_human",
      `Recovery for ${record.unit_id} requires human input.`,
      record.unit_id,
    );
    pinRecoveryTarget(root, runId, record.runtime, record.unit_id);
    return assessment;
  }

  if (assessment.recommendation === "replan" || assessment.recommendation === "restart") {
    transitionIfNeeded(root, "plan", `Recovery for ${record.unit_id} requires replanning.`, record.unit_id);
    pinRecoveryTarget(root, runId, record.runtime, record.unit_id);
    runPostmortem(root, runId, "recovery_replan");
    return assessment;
  }

  if (assessment.recommendation === "resume" || assessment.recommendation === "dispatch" || assessment.recommendation === "retry") {
    transitionIfNeeded(
      root,
      "recover",
      `Recovery for ${record.unit_id} recommends ${assessment.recommendation}.`,
      record.unit_id,
    );
    pinRecoveryTarget(root, runId, record.runtime, record.unit_id);
  }

  return assessment;
}
