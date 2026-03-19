import { rmSync } from "node:fs";
import { join } from "node:path";

import { fileExists, readJsonFile, readText, writeJsonFile } from "../fs.js";
import {
  cherryPick,
  createCommit,
  diffPaths,
  ensureMilestoneBranch,
  ensureTaskBranch,
  ensureWorktree,
  execGit,
  getBranchHead,
  getHeadCommit,
  gitStatusPorcelain,
  removeWorktree,
} from "../git.js";
import {
  INTEGRATION_STATE_PATH,
  PARALLEL_STATE_PATH,
  resolveRepoPath,
  WORKERS_DIR,
  WORKTREES_DIR,
} from "../paths.js";
import { isModernMilestone, loadTaskArtifact, parseUnitId } from "../planning/index.js";
import { buildContinuationPacket, saveContinuationArtifacts, writeRecoveryCheckpoint } from "../recovery/index.js";
import { getRuntimeAdapter } from "../runtime/adapters.js";
import { runCommand } from "../runtime/process.js";
import { loadRuntimeRegistry } from "../runtime/registry.js";
import { createRunId } from "../runtime/runs.js";
import type { DispatchPacket, NormalizedResult, RuntimeId } from "../runtime/types.js";
import {
  acquireLock,
  loadCurrentState,
  loadLocks,
  loadQueueState,
  reconcileState,
  releaseLock,
  saveCurrentState,
  saveQueueState,
} from "../state.js";
import { saveContextManifestFile, saveNextActionDecisionFile, savePromptFile, saveStateSnapshot, saveCanonicalRunRecord } from "../synth/runs.js";
import type { CanonicalRunGitSnapshot, ContextManifest, NextActionDecision } from "../synth/types.js";
import { renderDispatchPrompt } from "../runtime/prompts.js";
import { getTaskVerificationPaths, getTaskVerificationState, reviewReportRef, writeTaskCompletionArtifacts } from "../verify/index.js";
import { validateIntegrationReport, validateIntegrationState, validateParallelState, validateWorkerState } from "./schemas.js";
import type {
  IntegrationQueueItem,
  IntegrationReport,
  IntegrationRunResult,
  IntegrationState,
  ParallelDispatchResult,
  ParallelState,
  WorkerDispatchSummary,
  WorkerPhase,
  WorkerState,
} from "./types.js";

const DEFAULT_MAX_WORKERS = 2;
const REPORTS_DIR = ".supercodex/integration";

function parallelDefaults(): ParallelState {
  return {
    version: 1,
    max_workers: DEFAULT_MAX_WORKERS,
    last_dispatch_at: null,
    milestone_branch: null,
    milestone_worktree_path: null,
    worker_ids: [],
  };
}

function integrationDefaults(): IntegrationState {
  return {
    version: 1,
    active_unit_id: null,
    queue: [],
    last_integrated_unit_id: null,
    last_integration_commit: null,
    last_result: null,
    updated_at: null,
  };
}

function workerRef(workerId: string): string {
  return `${WORKERS_DIR}/${workerId}.json`;
}

function integrationReportRef(unitId: string): string {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id || !parsed.task_id) {
    throw new Error(`Integration reports require a task unit id, received ${unitId}.`);
  }
  return `${REPORTS_DIR}/${parsed.milestone_id}/${parsed.slice_id}/${parsed.task_id}.json`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function queueOrderIndex(root: string, unitId: string): number {
  const index = loadQueueState(root).items.findIndex((item) => item.unit_id === unitId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function loadParallelState(root: string): ParallelState {
  const path = resolveRepoPath(root, PARALLEL_STATE_PATH);
  if (!fileExists(path)) {
    return parallelDefaults();
  }

  const value = readJsonFile<ParallelState>(path);
  validateParallelState(value);
  return value;
}

export function saveParallelState(root: string, value: ParallelState): ParallelState {
  validateParallelState(value);
  writeJsonFile(resolveRepoPath(root, PARALLEL_STATE_PATH), value);
  return value;
}

export function loadIntegrationState(root: string): IntegrationState {
  const path = resolveRepoPath(root, INTEGRATION_STATE_PATH);
  if (!fileExists(path)) {
    return integrationDefaults();
  }

  const value = readJsonFile<IntegrationState>(path);
  validateIntegrationState(value);
  return value;
}

export function saveIntegrationState(root: string, value: IntegrationState): IntegrationState {
  validateIntegrationState(value);
  writeJsonFile(resolveRepoPath(root, INTEGRATION_STATE_PATH), value);
  return value;
}

export function loadWorkerState(root: string, workerId: string): WorkerState {
  const value = readJsonFile<WorkerState>(resolveRepoPath(root, workerRef(workerId)));
  validateWorkerState(value);
  return value;
}

export function listWorkerStates(root: string): WorkerState[] {
  const parallel = loadParallelState(root);
  return parallel.worker_ids.map((workerId) => loadWorkerState(root, workerId));
}

function saveWorkerState(root: string, value: WorkerState): WorkerState {
  validateWorkerState(value);
  writeJsonFile(resolveRepoPath(root, workerRef(value.worker_id)), value);

  const parallel = loadParallelState(root);
  if (!parallel.worker_ids.includes(value.worker_id)) {
    saveParallelState(root, {
      ...parallel,
      worker_ids: [...parallel.worker_ids, value.worker_id].sort(),
    });
  }

  return value;
}

function removeWorkerState(root: string, workerId: string): void {
  rmSync(resolveRepoPath(root, workerRef(workerId)), { force: true });
  const parallel = loadParallelState(root);
  saveParallelState(root, {
    ...parallel,
    worker_ids: parallel.worker_ids.filter((id) => id !== workerId),
  });
}

function nextWorkerId(root: string): string {
  const existing = new Set(listWorkerStates(root).map((worker) => worker.worker_id));
  for (let index = 1; index < 100; index += 1) {
    const candidate = `worker-${String(index).padStart(2, "0")}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("No worker id slots remain.");
}

function appendMetric(root: string, field: "parallel_dispatches" | "integrated_tasks" | "integration_conflicts", amount = 1): void {
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

function setQueueStatus(root: string, unitId: string, status: WorkerState["queue_status"] | "done"): void {
  const queue = loadQueueState(root);
  let found = false;
  saveQueueState(root, {
    ...queue,
    items: queue.items.map((item) => {
      if (item.unit_id !== unitId) {
        return item;
      }
      found = true;
      return {
        ...item,
        status,
      };
    }),
  });

  if (!found) {
    throw new Error(`Queue item ${unitId} was not found.`);
  }

  reconcileState(root);
}

function chooseRuntime(root: string): RuntimeId {
  const registry = loadRuntimeRegistry(root);
  for (const runtime of ["codex", "claude"] as const) {
    const entry = registry.runtimes[runtime];
    if (!entry.enabled || !entry.configured) {
      continue;
    }
    if (entry.last_probe?.available === false) {
      continue;
    }
    return runtime;
  }

  for (const runtime of ["codex", "claude"] as const) {
    const entry = registry.runtimes[runtime];
    if (entry.enabled && entry.configured) {
      return runtime;
    }
  }

  throw new Error("No enabled runtime is configured for parallel execution.");
}

function milestoneSlug(root: string, milestoneId: string): string {
  const ref = resolveRepoPath(root, `vault/milestones/${milestoneId}/milestone.md`);
  if (!fileExists(ref)) {
    return milestoneId.toLowerCase();
  }

  const firstLine = readJsonSafeLine(ref) ?? milestoneId;
  return firstLine
    .replace(/^#\s*/, "")
    .replace(new RegExp(`^${milestoneId}\\s*:?\s*`, "i"), "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || milestoneId.toLowerCase();
}

function readJsonSafeLine(path: string): string | null {
  try {
    const [line] = readText(path).split("\n");
    return line?.trim() ?? null;
  } catch {
    return null;
  }
}

function milestoneBranchName(root: string, milestoneId: string): string {
  return `milestone/${milestoneId}-${milestoneSlug(root, milestoneId)}`;
}

function milestoneWorktreePath(root: string, milestoneId: string): string {
  return resolveRepoPath(root, `${WORKTREES_DIR}/milestone-${milestoneId}`);
}

function taskBranchName(worker: Pick<WorkerState, "milestone_id" | "slice_id" | "task_id">): string {
  return `task/${worker.milestone_id}-${worker.slice_id}-${worker.task_id}`;
}

function taskWorktreePath(root: string, worker: Pick<WorkerState, "milestone_id" | "slice_id" | "task_id">): string {
  return resolveRepoPath(root, `${WORKTREES_DIR}/${worker.milestone_id}-${worker.slice_id}-${worker.task_id}`);
}

function queueDependenciesSatisfied(root: string, unitId: string): boolean {
  const queue = loadQueueState(root);
  const item = queue.items.find((entry) => entry.unit_id === unitId);
  if (!item) {
    return false;
  }

  const completed = new Set(queue.items.filter((entry) => entry.status === "done").map((entry) => entry.unit_id));
  return item.depends_on.every((dependency) => completed.has(dependency));
}

function gitSnapshot(root: string, milestoneBranch: string | null, taskBranch: string | null, worktreePath: string | null, baseCommit: string | null): CanonicalRunGitSnapshot {
  return {
    trunk_branch: loadCurrentState(root).git.trunk_branch,
    milestone_branch: milestoneBranch,
    task_branch: taskBranch,
    worktree_path: worktreePath,
    base_commit: baseCommit,
    head_commit: worktreePath && fileExists(join(worktreePath, ".git")) ? getHeadCommit(worktreePath) : null,
    dirty: worktreePath ? gitStatusPorcelain(worktreePath).length > 0 : false,
  };
}

function taskArtifactRef(milestoneId: string, sliceId: string, taskId: string): string {
  return `vault/milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}.md`;
}

function milestoneRefPath(milestoneId: string): string {
  return `vault/milestones/${milestoneId}/milestone.md`;
}

function resolvePreferredPath(primaryRoot: string, fallbackRoot: string, ref: string): string {
  const primaryPath = resolveRepoPath(primaryRoot, ref);
  return fileExists(primaryPath) ? primaryPath : resolveRepoPath(fallbackRoot, ref);
}

function buildContextManifest(root: string, worker: WorkerState, phase: WorkerPhase, reviewerPass: string | null): ContextManifest {
  const taskRef = resolvePreferredPath(worker.worktree_path, root, taskArtifactRef(worker.milestone_id, worker.slice_id, worker.task_id));
  const verification = getTaskVerificationPaths(worker.unit_id);
  const milestoneRef = resolvePreferredPath(worker.worktree_path, root, milestoneRefPath(worker.milestone_id));
  const reviewRef = reviewerPass ? resolveRepoPath(worker.worktree_path, reviewReportRef(worker.unit_id, reviewerPass)) : null;
  const verificationRef = resolveRepoPath(worker.worktree_path, verification.verification_ref);
  const refs = unique([
    resolveRepoPath(root, "SUPER_CODEX.md"),
    resolveRepoPath(root, ".supercodex/state/current.json"),
    resolveRepoPath(root, ".supercodex/state/queue.json"),
    milestoneRef,
    taskRef,
    phase === "verify" || phase === "review" ? verificationRef : "",
    phase === "review" && reviewRef ? reviewRef : "",
  ]);

  return {
    version: 1,
    unit_id: worker.unit_id,
    context_profile: loadCurrentState(root).context_profile,
    layers: {
      system: refs.slice(0, 3),
      unit: [taskRef, phase === "verify" || phase === "review" ? verificationRef : ""].filter(Boolean),
      milestone: [milestoneRef],
      supporting: reviewRef ? [reviewRef] : [],
      retry: [],
    },
    refs,
  };
}

function buildWorkerPacket(root: string, worker: WorkerState): { packet: DispatchPacket; reviewer_pass: string | null } {
  const artifact = loadTaskArtifact(root, worker.milestone_id, worker.slice_id, worker.task_id);
  const verificationPaths = getTaskVerificationPaths(worker.unit_id);
  const verificationState = getTaskVerificationState(root, worker.unit_id, worker.worktree_path);
  const reviewerPass = worker.phase === "review" ? verificationState.next_reviewer : null;

  const tests =
    artifact.verification_ladder.focused_tests.length > 0 ? [...artifact.verification_ladder.focused_tests] : ["pnpm test"];
  const packet: DispatchPacket = {
    version: 1,
    unit_id: worker.unit_id,
    unit_type: worker.phase === "implement" ? "task" : worker.phase === "verify" ? "verification" : "review",
    role: worker.phase === "implement" ? "implementer" : worker.phase === "verify" ? "verifier" : "reviewers",
    objective:
      worker.phase === "implement"
        ? artifact.objective
        : worker.phase === "verify"
          ? `Verify ${worker.unit_id} against its task contract, TDD mode, and evidence.`
          : `Review ${worker.unit_id} from the ${reviewerPass ?? "required"} perspective.`,
    context_refs: buildContextManifest(root, worker, worker.phase, reviewerPass).refs,
    acceptance_criteria:
      worker.phase === "implement"
        ? [...artifact.acceptance_criteria]
        : worker.phase === "verify"
          ? [...artifact.acceptance_criteria, `Write verification JSON to ${verificationPaths.verification_ref}.`]
          : [...artifact.acceptance_criteria, `Write review JSON to ${reviewReportRef(worker.unit_id, reviewerPass ?? "review")}.`],
    files_in_scope:
      worker.phase === "implement"
        ? [...artifact.likely_files]
        : worker.phase === "verify"
          ? unique([...artifact.likely_files, verificationPaths.verification_ref])
          : unique([...artifact.likely_files, verificationPaths.verification_ref, reviewReportRef(worker.unit_id, reviewerPass ?? "review")]),
    tests,
    verification_plan: [...artifact.verification_plan],
    constraints: unique([
      `TDD mode: ${artifact.tdd_mode}`,
      artifact.tdd_justification ? `TDD justification: ${artifact.tdd_justification}` : "",
      reviewerPass ? `Reviewer pass: ${reviewerPass}` : "",
      `Worker id: ${worker.worker_id}`,
    ]),
    safety_class: artifact.safety_class,
    git_context: {
      control_root: root,
      workspace_root: worker.worktree_path,
      milestone_branch: worker.milestone_branch,
      task_branch: worker.task_branch,
      base_commit: worker.base_commit,
    },
    owned_resources: [...worker.owned_resources],
    output_contract: {
      must_update_artifacts: worker.phase !== "implement",
      must_produce_evidence: true,
      must_not_claim_done_without_verification: true,
      notes:
        worker.phase === "verify"
          ? [`Update ${verificationPaths.verification_ref} before reporting success.`]
          : worker.phase === "review" && reviewerPass
            ? [`Update ${reviewReportRef(worker.unit_id, reviewerPass)} before reporting success.`]
            : [],
    },
    stop_conditions: [
      "Pause if a locked resource is already owned by another worker.",
      "Pause if the worktree does not match the declared base commit.",
      "Pause if execution would require unplanned files outside the owned resource set.",
    ],
    artifacts_to_update:
      worker.phase === "implement"
        ? []
        : worker.phase === "verify"
          ? [verificationPaths.verification_ref]
          : [reviewReportRef(worker.unit_id, reviewerPass ?? "review")],
  };

  return {
    packet,
    reviewer_pass: reviewerPass,
  };
}

async function dispatchUnit(params: {
  root: string;
  worker: WorkerState;
  packet: DispatchPacket;
  reviewer_pass: string | null;
  role: string;
  unit_type: string;
  phase: Exclude<WorkerPhase, "ready_to_integrate">;
}): Promise<{ run_id: string; result: NormalizedResult }> {
  const { root, worker, packet, reviewer_pass: reviewerPass, role, unit_type, phase } = params;
  const runtime = worker.runtime;
  const runId = createRunId(runtime, worker.unit_id);
  const manifest = buildContextManifest(root, worker, phase, reviewerPass);
  const decision: NextActionDecision = {
    version: 1,
    action: "dispatch",
    unit_id: worker.unit_id,
    unit_type,
    phase,
    role,
    runtime,
    rationale: [`Parallel worker ${worker.worker_id} is advancing ${worker.unit_id} through ${phase}.`],
    retry_count: 0,
    selected_run_id: worker.last_run_id,
    context_profile: loadCurrentState(root).context_profile,
    reviewer_pass: reviewerPass,
  };
  saveNextActionDecisionFile(root, runId, decision);
  saveContextManifestFile(root, runId, manifest);
  writeJsonFile(resolveRepoPath(root, `.supercodex/runs/${runId}/packet.json`), packet);
  savePromptFile(root, runId, renderDispatchPrompt(packet));
  saveStateSnapshot(root, runId, {
    current: loadCurrentState(root),
    worker,
  });
  saveContinuationArtifacts(root, runId, buildContinuationPacket(runId, decision, packet, null));
  writeRecoveryCheckpoint(root, runId, "pre_dispatch", `Parallel ${phase} prepared for ${worker.unit_id}.`, worker.unit_id, runtime);

  const record = {
    version: 1,
    run_id: runId,
    parent_run_id: null,
    unit_id: worker.unit_id,
    unit_type,
    action: "dispatch" as const,
    role,
    runtime,
    status: "running" as const,
    summary: `Parallel ${phase} prepared for ${worker.unit_id}.`,
    decision_ref: `.supercodex/runs/${runId}/decision.json`,
    context_ref: `.supercodex/runs/${runId}/context.json`,
    packet_ref: `.supercodex/runs/${runId}/packet.json`,
    prompt_ref: `.supercodex/runs/${runId}/prompt.md`,
    handle_ref: null,
    normalized_ref: null,
    raw_ref: null,
    continuation_ref: `.supercodex/runs/${runId}/continue.md`,
    state_ref: `.supercodex/runs/${runId}/state.json`,
    started_at: new Date().toISOString(),
    completed_at: null,
    retry_count: 0,
    git_before: gitSnapshot(root, worker.milestone_branch, worker.task_branch, worker.worktree_path, worker.base_commit),
    git_after: null,
    blockers: [],
    assumptions: [],
    verification_evidence: [],
    followups: [],
    reviewer_pass: reviewerPass,
    skills_used: [],
    usage: null,
  };
  saveCanonicalRunRecord(root, record);

  const adapter = getRuntimeAdapter(runtime);
  const dispatched = await adapter.dispatch(root, packet, runId, { execution_cwd: worker.worktree_path });

  saveContinuationArtifacts(root, runId, buildContinuationPacket(runId, decision, packet, dispatched.result));
  writeRecoveryCheckpoint(root, runId, "post_result", `Parallel ${phase} captured ${dispatched.result.status} for ${worker.unit_id}.`, worker.unit_id, runtime);
  saveCanonicalRunRecord(root, {
    ...record,
    parent_run_id: dispatched.handle.parent_run_id,
    status: dispatched.result.status,
    summary: dispatched.result.summary,
    handle_ref: `.supercodex/runs/${runId}/handle.json`,
    normalized_ref: `.supercodex/runs/${runId}/normalized.json`,
    raw_ref: dispatched.result.raw_ref,
    completed_at: dispatched.result.completed_at,
    git_after: gitSnapshot(root, worker.milestone_branch, worker.task_branch, worker.worktree_path, worker.base_commit),
    blockers: [...dispatched.result.blockers],
    assumptions: [...dispatched.result.assumptions],
    verification_evidence: [...dispatched.result.verification_evidence],
    followups: [...dispatched.result.followups],
    skills_used: [...(dispatched.result.skills_used ?? [])],
    usage: dispatched.result.usage ?? null,
  });

  appendMetric(root, "parallel_dispatches", 1);
  return {
    run_id: runId,
    result: dispatched.result,
  };
}

function updateWorker(root: string, worker: WorkerState): WorkerState {
  const next = saveWorkerState(root, {
    ...worker,
    updated_at: new Date().toISOString(),
  });
  const parallel = loadParallelState(root);
  saveParallelState(root, {
    ...parallel,
    last_dispatch_at: next.updated_at,
  });
  return next;
}

function lockResources(root: string, worker: WorkerState): void {
  const acquired: string[] = [];
  try {
    for (const resource of worker.owned_resources) {
      acquireLock(root, {
        resource,
        owner: worker.worker_id,
        scope: "task",
        reason: `Parallel ownership for ${worker.unit_id}`,
        lock_kind: "resource",
        worker_id: worker.worker_id,
        unit_id: worker.unit_id,
        base_commit: worker.base_commit,
        worktree_path: worker.worktree_path,
        acquired_at: new Date().toISOString(),
      });
      acquired.push(resource);
    }
  } catch (error) {
    for (const resource of acquired) {
      try {
        releaseLock(root, resource);
      } catch {
        // Best-effort rollback.
      }
    }
    throw error;
  }
}

function unlockResources(root: string, worker: WorkerState): void {
  for (const resource of worker.owned_resources) {
    try {
      releaseLock(root, resource);
    } catch {
      // Ignore stale lock cleanup.
    }
  }
}

function ensureParallelWorkspace(root: string, milestoneId: string): ParallelState {
  const current = loadCurrentState(root);
  const branch = milestoneBranchName(root, milestoneId);
  ensureMilestoneBranch(root, branch, current.git.trunk_branch);
  const worktreePath = milestoneWorktreePath(root, milestoneId);
  ensureWorktree(root, worktreePath, branch);
  return saveParallelState(root, {
    ...loadParallelState(root),
    milestone_branch: branch,
    milestone_worktree_path: worktreePath,
  });
}

interface ParallelCandidate {
  unit_id: string;
  milestone_id: string;
  slice_id: string;
  task_id: string;
  resources: string[];
}

export function computeParallelEligibleItems(root: string, requestedWorkers?: number): ParallelCandidate[] {
  const queue = loadQueueState(root);
  const workers = listWorkerStates(root);
  const activeResources = new Set(
    loadLocks(root)
      .filter((lock) => lock.lock_kind === "resource")
      .map((lock) => lock.resource),
  );
  const selectedResources = new Set<string>();
  const maxWorkers = requestedWorkers ?? loadParallelState(root).max_workers;
  const availableSlots = Math.max(0, maxWorkers - workers.filter((worker) => worker.status !== "blocked").length);
  const candidates: ParallelCandidate[] = [];

  for (const item of queue.items) {
    if (candidates.length >= availableSlots) {
      break;
    }
    if (item.unit_type !== "task" || item.status !== "ready" || !queueDependenciesSatisfied(root, item.unit_id)) {
      continue;
    }

    const parsed = parseUnitId(item.unit_id);
    if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id || !parsed.task_id || !isModernMilestone(parsed.milestone_id)) {
      continue;
    }

    const artifact = loadTaskArtifact(root, parsed.milestone_id, parsed.slice_id, parsed.task_id);
    const resources = unique(artifact.likely_files);
    const regressionCommands = unique([
      ...artifact.verification_ladder.slice_regression,
      ...artifact.verification_ladder.milestone_regression,
    ]);
    if (resources.length === 0 || regressionCommands.length === 0) {
      continue;
    }
    if (resources.some((resource) => activeResources.has(resource) || selectedResources.has(resource))) {
      continue;
    }

    resources.forEach((resource) => selectedResources.add(resource));
    candidates.push({
      unit_id: item.unit_id,
      milestone_id: parsed.milestone_id,
      slice_id: parsed.slice_id,
      task_id: parsed.task_id,
      resources,
    });
  }

  return candidates;
}

function claimWorker(root: string, candidate: ParallelCandidate): WorkerState {
  const parallel = ensureParallelWorkspace(root, candidate.milestone_id);
  const workerId = nextWorkerId(root);
  const branch = parallel.milestone_branch!;
  const baseCommit = getBranchHead(root, branch);
  const taskBranch = taskBranchName(candidate);
  ensureTaskBranch(root, taskBranch, baseCommit);
  const worktreePath = taskWorktreePath(root, candidate);
  ensureWorktree(root, worktreePath, taskBranch);

  const worker: WorkerState = {
    version: 1,
    worker_id: workerId,
    unit_id: candidate.unit_id,
    phase: "implement",
    status: "active",
    milestone_id: candidate.milestone_id,
    slice_id: candidate.slice_id,
    task_id: candidate.task_id,
    runtime: chooseRuntime(root),
    role: "implementer",
    reviewer_pass: null,
    milestone_branch: branch,
    task_branch: taskBranch,
    worktree_path: worktreePath,
    base_commit: baseCommit,
    current_run_id: null,
    last_run_id: null,
    canonical_commit: null,
    queue_status: "active",
    owned_resources: [...candidate.resources],
    assigned_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  lockResources(root, worker);
  saveWorkerState(root, worker);
  setQueueStatus(root, worker.unit_id, "active");
  return worker;
}

async function advanceWorker(root: string, worker: WorkerState): Promise<WorkerDispatchSummary> {
  const phaseBefore = worker.phase;
  if (worker.phase === "ready_to_integrate" || worker.status === "blocked") {
    return {
      worker_id: worker.worker_id,
      unit_id: worker.unit_id,
      phase_before: phaseBefore,
      phase_after: worker.phase,
      run_id: worker.last_run_id,
      status: worker.status,
    };
  }

  const { packet, reviewer_pass: reviewerPass } = buildWorkerPacket(root, worker);
  const role = packet.role;
  const unitType = packet.unit_type;
  const dispatched = await dispatchUnit({
    root,
    worker,
    packet,
    reviewer_pass: reviewerPass,
    role,
    unit_type: unitType,
    phase: worker.phase,
  });

  let nextWorker: WorkerState = {
    ...worker,
    role,
    reviewer_pass: reviewerPass,
    current_run_id: dispatched.run_id,
    last_run_id: dispatched.run_id,
    updated_at: new Date().toISOString(),
  };

  if (dispatched.result.status === "blocked") {
    nextWorker = {
      ...nextWorker,
      phase: "blocked",
      status: "blocked",
      queue_status: "blocked",
    };
    saveWorkerState(root, nextWorker);
    setQueueStatus(root, nextWorker.unit_id, "blocked");
  } else if (dispatched.result.status !== "success") {
    nextWorker = {
      ...nextWorker,
      phase: "recover",
      status: "active",
      queue_status: "active",
    };
    saveWorkerState(root, nextWorker);
  } else if (phaseBefore === "implement") {
    nextWorker = updateWorker(root, {
      ...nextWorker,
      phase: "verify",
      status: "active",
      queue_status: "active",
    });
  } else if (phaseBefore === "verify") {
    const verificationState = getTaskVerificationState(root, worker.unit_id, worker.worktree_path);
    nextWorker = updateWorker(root, {
      ...nextWorker,
      phase:
        !verificationState.verification || verificationState.verification.verdict === "fail"
          ? "implement"
          : verificationState.verification.verdict === "blocked"
            ? "blocked"
            : "review",
      status: verificationState.verification?.verdict === "blocked" ? "blocked" : "active",
      queue_status: verificationState.verification?.verdict === "blocked" ? "blocked" : "active",
      reviewer_pass: verificationState.next_reviewer,
    });
    if (nextWorker.status === "blocked") {
      setQueueStatus(root, worker.unit_id, "blocked");
    }
  } else {
    const verificationState = getTaskVerificationState(root, worker.unit_id, worker.worktree_path);
    const review = reviewerPass ? verificationState.reviews.filter((entry) => entry.persona === reviewerPass).at(-1) ?? null : null;
    if (!review) {
      nextWorker = updateWorker(root, {
        ...nextWorker,
        phase: "recover",
      });
    } else if (review.verdict === "blocked") {
      nextWorker = updateWorker(root, {
        ...nextWorker,
        phase: "blocked",
        status: "blocked",
        queue_status: "blocked",
      });
      setQueueStatus(root, worker.unit_id, "blocked");
    } else if (review.verdict === "changes_requested") {
      nextWorker = updateWorker(root, {
        ...nextWorker,
        phase: "implement",
        reviewer_pass: null,
      });
    } else if (verificationState.pending_reviewers.length > 0) {
      nextWorker = updateWorker(root, {
        ...nextWorker,
        phase: "review",
        reviewer_pass: verificationState.next_reviewer,
      });
    } else {
      writeTaskCompletionArtifacts(root, worker.unit_id, worker.worktree_path);
      const canonicalCommit = createCommit(worker.worktree_path, `${worker.unit_id} run ${dispatched.run_id}`);
      enqueueIntegration(root, nextWorker, canonicalCommit);
      nextWorker = updateWorker(root, {
        ...nextWorker,
        phase: "ready_to_integrate",
        status: "ready_to_integrate",
        queue_status: "ready_to_integrate",
        canonical_commit: canonicalCommit,
        reviewer_pass: null,
      });
      setQueueStatus(root, worker.unit_id, "ready_to_integrate");
    }
  }

  return {
    worker_id: worker.worker_id,
    unit_id: worker.unit_id,
    phase_before: phaseBefore,
    phase_after: nextWorker.phase,
    run_id: dispatched.run_id,
    status: nextWorker.status,
  };
}

function enqueueIntegration(root: string, worker: WorkerState, canonicalCommit: string): void {
  const artifact = loadTaskArtifact(root, worker.milestone_id, worker.slice_id, worker.task_id);
  const commands = unique([
    ...artifact.verification_ladder.slice_regression,
    ...artifact.verification_ladder.milestone_regression,
  ]);
  const integration = loadIntegrationState(root);
  if (integration.queue.some((entry) => entry.unit_id === worker.unit_id)) {
    return;
  }

  const nextItem: IntegrationQueueItem = {
    unit_id: worker.unit_id,
    worker_id: worker.worker_id,
    canonical_commit: canonicalCommit,
    task_branch: worker.task_branch,
    milestone_branch: worker.milestone_branch,
    worktree_path: worker.worktree_path,
    base_commit: worker.base_commit,
    regression_commands: commands,
    status: "ready",
    enqueued_at: new Date().toISOString(),
    last_error: null,
  };

  saveIntegrationState(root, {
    ...integration,
    queue: [...integration.queue, nextItem].sort((left, right) => {
      const delta = queueOrderIndex(root, left.unit_id) - queueOrderIndex(root, right.unit_id);
      return delta !== 0 ? delta : left.enqueued_at.localeCompare(right.enqueued_at);
    }),
    updated_at: new Date().toISOString(),
  });
}

export async function dispatchParallel(root: string, requestedWorkers?: number): Promise<ParallelDispatchResult> {
  const current = loadCurrentState(root);
  if (!current.active_milestone || !isModernMilestone(current.active_milestone)) {
    throw new Error("Parallel dispatch requires an active modern milestone.");
  }

  const parallel = saveParallelState(root, {
    ...loadParallelState(root),
    max_workers: requestedWorkers ?? loadParallelState(root).max_workers,
  });
  const existingWorkers = listWorkerStates(root);
  const advancedWorkers = await Promise.all(existingWorkers.map((worker) => advanceWorker(root, worker)));
  const candidates = computeParallelEligibleItems(root, requestedWorkers ?? parallel.max_workers);
  const claimedWorkers = candidates.map((candidate) => claimWorker(root, candidate));
  const claimedSummaries = await Promise.all(claimedWorkers.map((worker) => advanceWorker(root, worker)));

  return {
    version: 1,
    requested_workers: requestedWorkers ?? parallel.max_workers,
    parallel_state: loadParallelState(root),
    workers: listWorkerStates(root),
    claimed_units: claimedWorkers.map((worker) => worker.unit_id),
    advanced_workers: [...advancedWorkers, ...claimedSummaries],
  };
}

export function showParallel(root: string): { parallel_state: ParallelState; workers: WorkerState[]; eligible_units: string[] } {
  const parallel = loadParallelState(root);
  return {
    parallel_state: parallel,
    workers: listWorkerStates(root),
    eligible_units: computeParallelEligibleItems(root, parallel.max_workers).map((candidate) => candidate.unit_id),
  };
}

async function runRegressionCommands(cwd: string, commands: string[]): Promise<IntegrationReport["regressions"]> {
  const regressions: IntegrationReport["regressions"] = [];
  for (const command of commands) {
    const result = await runCommand({
      command: "/bin/zsh",
      args: ["-lc", command],
      cwd,
    });
    regressions.push({
      command,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (result.exit_code !== 0) {
      break;
    }
  }
  return regressions;
}

function saveIntegrationReport(root: string, report: IntegrationReport): string {
  validateIntegrationReport(report);
  const ref = integrationReportRef(report.unit_id);
  writeJsonFile(resolveRepoPath(root, ref), report);
  return ref;
}

function integrationLockResource(milestoneId: string): string {
  return `integration::${milestoneId}`;
}

function claimIntegrationLock(root: string, item: IntegrationQueueItem): void {
  acquireLock(root, {
    resource: integrationLockResource(parseUnitId(item.unit_id).milestone_id ?? "unknown"),
    owner: "integrator",
    scope: "milestone",
    reason: `Serial integration for ${item.unit_id}`,
    lock_kind: "integration",
    worker_id: item.worker_id,
    unit_id: item.unit_id,
    base_commit: item.base_commit,
    worktree_path: item.worktree_path,
    acquired_at: new Date().toISOString(),
  });
}

function releaseIntegrationLock(root: string, item: IntegrationQueueItem): void {
  try {
    releaseLock(root, integrationLockResource(parseUnitId(item.unit_id).milestone_id ?? "unknown"));
  } catch {
    // Ignore stale lock cleanup.
  }
}

function semanticConflicts(root: string, item: IntegrationQueueItem, worker: WorkerState, milestoneRoot: string): string[] {
  const conflicts: string[] = [];
  const milestoneHead = getHeadCommit(milestoneRoot);
  if (milestoneHead !== item.base_commit) {
    conflicts.push(`Milestone branch ${item.milestone_branch} advanced from ${item.base_commit} to ${milestoneHead}.`);
  }

  if (item.regression_commands.length === 0) {
    conflicts.push(`No slice or milestone regression commands are declared for ${item.unit_id}.`);
  }

  if (!worker.canonical_commit) {
    conflicts.push(`Worker ${worker.worker_id} has no canonical verified commit.`);
  }

  const verificationState = getTaskVerificationState(root, item.unit_id, worker.worktree_path);
  if (!verificationState.completion) {
    conflicts.push(`Task ${item.unit_id} is missing completion.json in the worker worktree.`);
  }

  return conflicts;
}

async function dispatchIntegrationReview(root: string, item: IntegrationQueueItem, milestoneRoot: string): Promise<NormalizedResult> {
  const worker = loadWorkerState(root, item.worker_id);
  const packet: DispatchPacket = {
    version: 1,
    unit_id: item.unit_id,
    unit_type: "integration",
    role: "integrator",
    objective: `Integrate ${item.unit_id} onto ${item.milestone_branch} without violating task contracts or regressions.`,
    context_refs: unique([
      resolveRepoPath(root, "SUPER_CODEX.md"),
      resolvePreferredPath(worker.worktree_path, root, taskArtifactRef(worker.milestone_id, worker.slice_id, worker.task_id)),
      resolveRepoPath(worker.worktree_path, getTaskVerificationPaths(item.unit_id).completion_ref),
    ]),
    acceptance_criteria: [
      `Confirm ${item.unit_id} can land cleanly on ${item.milestone_branch}.`,
      "Report any semantic conflict before the task is marked done.",
    ],
    files_in_scope: diffPaths(worker.worktree_path, item.base_commit, item.canonical_commit),
    tests: [...item.regression_commands],
    verification_plan: [...item.regression_commands],
    constraints: [
      `Milestone branch: ${item.milestone_branch}`,
      `Canonical commit: ${item.canonical_commit}`,
      `Base commit: ${item.base_commit}`,
    ],
    safety_class: "reversible",
    git_context: {
      control_root: root,
      workspace_root: milestoneRoot,
      milestone_branch: item.milestone_branch,
      task_branch: item.task_branch,
      base_commit: item.base_commit,
    },
    owned_resources: [],
    output_contract: {
      must_update_artifacts: false,
      must_produce_evidence: true,
      must_not_claim_done_without_verification: true,
      notes: ["Return a precise integration summary."],
    },
    stop_conditions: [
      "Pause if milestone drift or missing completion artifacts make integration unsafe.",
      "Pause if regression commands are missing or failing.",
    ],
    artifacts_to_update: [],
  };
  const runtime = chooseRuntime(root);
  const workerLike: WorkerState = {
    ...worker,
    runtime,
    role: "integrator",
    phase: "review",
    status: "active",
    reviewer_pass: null,
    worktree_path: milestoneRoot,
  };
  return (await dispatchUnit({
    root,
    worker: workerLike,
    packet,
    reviewer_pass: null,
    role: "integrator",
    unit_type: "integration",
    phase: "review",
  })).result;
}

export async function runIntegration(root: string, unitId?: string): Promise<IntegrationRunResult> {
  const integration = loadIntegrationState(root);
  const item =
    (unitId ? integration.queue.find((entry) => entry.unit_id === unitId && entry.status === "ready") : integration.queue.find((entry) => entry.status === "ready")) ??
    null;
  if (!item) {
    throw new Error(unitId ? `No ready integration item exists for ${unitId}.` : "No ready integration item exists.");
  }

  const worker = loadWorkerState(root, item.worker_id);
  const parallel = loadParallelState(root);
  const milestoneRoot = parallel.milestone_worktree_path;
  if (!milestoneRoot) {
    throw new Error("Parallel milestone worktree is missing.");
  }

  claimIntegrationLock(root, item);
  const preflight = [
    `Worker ${item.worker_id} owns ${worker.owned_resources.length} resource locks.`,
    `Milestone worktree: ${milestoneRoot}`,
    `Canonical commit: ${item.canonical_commit}`,
  ];
  const conflicts = semanticConflicts(root, item, worker, milestoneRoot);
  let regressions: IntegrationReport["regressions"] = [];
  let integrationCommit: string | null = null;
  let verdict: IntegrationReport["verdict"] = "blocked";
  let summary = conflicts.length > 0 ? conflicts[0] : `Integrated ${item.unit_id} onto ${item.milestone_branch}.`;

  try {
    if (conflicts.length === 0) {
      const review = await dispatchIntegrationReview(root, item, milestoneRoot);
      if (review.status !== "success") {
        conflicts.push(`Integrator runtime reported ${review.status}: ${review.summary}`);
      }
    }

    if (conflicts.length === 0) {
      integrationCommit = cherryPick(milestoneRoot, item.canonical_commit);
      regressions = await runRegressionCommands(milestoneRoot, item.regression_commands);
      const failed = regressions.find((entry) => entry.exit_code !== 0);
      if (failed) {
        conflicts.push(`Regression failed: ${failed.command}`);
        execGit(milestoneRoot, ["reset", "--hard", "HEAD~1"]);
        integrationCommit = null;
      }
    }

    verdict = conflicts.length === 0 ? "integrated" : "blocked";
    summary = verdict === "integrated" ? `Integrated ${item.unit_id} onto ${item.milestone_branch}.` : conflicts[0];
  } finally {
    releaseIntegrationLock(root, item);
  }

  const report: IntegrationReport = {
    version: 1,
    unit_id: item.unit_id,
    worker_id: item.worker_id,
    milestone_branch: item.milestone_branch,
    task_branch: item.task_branch,
    canonical_commit: item.canonical_commit,
    base_commit: item.base_commit,
    preflight,
    regressions,
    semantic_conflicts: conflicts,
    summary,
    verdict,
    generated_at: new Date().toISOString(),
  };
  const reportRef = saveIntegrationReport(root, report);

  const nextIntegration = loadIntegrationState(root);
  saveIntegrationState(root, {
    ...nextIntegration,
    active_unit_id: null,
    queue:
      verdict === "integrated"
        ? nextIntegration.queue.filter((entry) => entry.unit_id !== item.unit_id)
        : nextIntegration.queue.map((entry) =>
            entry.unit_id === item.unit_id
              ? {
                  ...entry,
                  status: "blocked",
                  last_error: summary,
                }
              : entry,
          ),
    last_integrated_unit_id: verdict === "integrated" ? item.unit_id : nextIntegration.last_integrated_unit_id,
    last_integration_commit: verdict === "integrated" ? integrationCommit : nextIntegration.last_integration_commit,
    last_result: verdict === "integrated" ? "success" : "blocked",
    updated_at: new Date().toISOString(),
  });

  if (verdict === "integrated") {
    setQueueStatus(root, item.unit_id, "done");
    unlockResources(root, worker);
    removeWorktree(root, worker.worktree_path);
    removeWorkerState(root, worker.worker_id);
    appendMetric(root, "integrated_tasks", 1);
  } else {
    appendMetric(root, "integration_conflicts", 1);
  }

  return {
    version: 1,
    unit_id: item.unit_id,
    worker_id: item.worker_id,
    status: verdict,
    report_ref: reportRef,
    milestone_branch: item.milestone_branch,
    canonical_commit: item.canonical_commit,
    integration_commit: integrationCommit,
  };
}

export function showIntegration(root: string): { integration_state: IntegrationState; workers: WorkerState[] } {
  return {
    integration_state: loadIntegrationState(root),
    workers: listWorkerStates(root),
  };
}
