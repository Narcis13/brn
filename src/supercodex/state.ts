import { basename, join } from "node:path";

import { auditSchemaFileEntries } from "./audit/schemas.js";
import {
  learningSchemaFileEntries,
  validateLearningState,
  validatePatternCandidate,
  validateProcessImprovementReport,
  validateRoadmapReassessmentReport,
  validateSkillHealthSnapshot,
} from "./learning/schemas.js";
import { parallelSchemaFileEntries, validateIntegrationState, validateParallelState, validateWorkerState } from "./parallel/schemas.js";
import {
  appendJsonLine,
  fileExists,
  listFiles,
  readJsonFile,
  readJsonLines,
  readText,
  removeFile,
  writeJsonFile,
  writeTextAtomic,
} from "./fs.js";
import { reconcileGitState } from "./git.js";
import {
  CURRENT_STATE_PATH,
  INTEGRATION_STATE_PATH,
  LEARNING_PATTERNS_DIR,
  LEARNING_PROCESS_DIR,
  LEARNING_ROADMAP_DIR,
  LEARNING_SKILLS_DIR,
  LEARNING_STATE_PATH,
  LOCKS_DIR,
  PARALLEL_STATE_PATH,
  QUEUE_STATE_PATH,
  resolveRepoPath,
  TRANSITIONS_PATH,
  WORKERS_DIR,
} from "./paths.js";
import {
  schemaFileEntries,
  validateCurrentState,
  validateLockRecord,
  validateQueueState,
  validateTransitionRecord,
} from "./schemas.js";
import { isModernMilestone, parseUnitId, validatePlanningUnit } from "./planning/index.js";
import { recoverySchemaFileEntries } from "./recovery/schemas.js";
import { loadDispatchTemplate, loadRuntimeRegistry } from "./runtime/registry.js";
import { runtimeSchemaFileEntries } from "./runtime/schemas.js";
import { getCanonicalRunPaths } from "./synth/runs.js";
import { synthSchemaFileEntries } from "./synth/schemas.js";
import { verifySchemaFileEntries } from "./verify/schemas.js";
import { getTaskVerificationState, verificationDoctorIssues } from "./verify/index.js";
import type {
  CurrentState,
  LockRecord,
  Phase,
  QueueItem,
  QueueState,
  TransitionRecord,
} from "./types.js";

const TRANSITION_RULES: Record<Phase, Phase[]> = {
  intake: ["clarify", "map", "plan"],
  clarify: ["map", "research", "plan"],
  map: ["research", "plan"],
  research: ["map", "plan"],
  plan: ["clarify", "map", "research", "dispatch"],
  dispatch: ["plan", "implement", "verify", "review", "complete_task", "complete_slice"],
  implement: ["dispatch", "verify"],
  verify: ["dispatch", "implement", "review"],
  review: ["dispatch", "implement", "integrate", "complete_task"],
  integrate: ["complete_task", "complete_slice"],
  complete_task: ["reassess", "dispatch", "complete_slice"],
  complete_slice: ["reassess", "complete"],
  reassess: ["plan", "dispatch", "complete"],
  recover: ["plan", "dispatch", "implement", "verify", "review", "integrate", "complete_task", "complete_slice", "complete"],
  awaiting_human: ["recover", "plan", "dispatch", "implement"],
  blocked: ["recover", "plan", "dispatch", "implement"],
  complete: [],
};

function currentMetricDefaults(): CurrentState["metrics"] {
  return {
    human_interventions: 0,
    completed_tasks: 0,
    failed_attempts: 0,
    recovered_runs: 0,
    recovery_mismatches: 0,
    memory_audits: 0,
    postmortems_generated: 0,
    parallel_dispatches: 0,
    integrated_tasks: 0,
    integration_conflicts: 0,
    learning_cycles: 0,
    skill_health_refreshes: 0,
    pattern_candidates_generated: 0,
    roadmap_reassessments: 0,
    process_reports_generated: 0,
  };
}

function normalizeCurrentState(raw: CurrentState): CurrentState {
  return {
    ...raw,
    metrics: {
      ...currentMetricDefaults(),
      ...(raw.metrics ?? {}),
    },
  };
}

export function loadCurrentState(root: string): CurrentState {
  const current = normalizeCurrentState(readJsonFile<CurrentState>(resolveRepoPath(root, CURRENT_STATE_PATH)));
  validateCurrentState(current);
  return current;
}

export function saveCurrentState(root: string, state: CurrentState): void {
  validateCurrentState(state);
  writeJsonFile(resolveRepoPath(root, CURRENT_STATE_PATH), state);
}

export function loadQueueState(root: string): QueueState {
  const queue = readJsonFile<QueueState>(resolveRepoPath(root, QUEUE_STATE_PATH));
  validateQueueState(queue);
  return queue;
}

export function saveQueueState(root: string, queue: QueueState): void {
  validateQueueState(queue);
  writeJsonFile(resolveRepoPath(root, QUEUE_STATE_PATH), queue);
}

export function loadTransitions(root: string): TransitionRecord[] {
  const transitions = readJsonLines<TransitionRecord>(resolveRepoPath(root, TRANSITIONS_PATH));
  transitions.forEach((transition) => validateTransitionRecord(transition));
  return transitions;
}

export function overwriteTransitions(root: string, transitions: TransitionRecord[]): void {
  transitions.forEach((transition) => validateTransitionRecord(transition));
  const targetPath = resolveRepoPath(root, TRANSITIONS_PATH);
  const content = transitions.map((transition) => JSON.stringify(transition)).join("\n");
  const finalContent = content.length > 0 ? `${content}\n` : "";
  writeTextAtomic(targetPath, finalContent);
}

function transitionsPath(root: string): string {
  return resolveRepoPath(root, TRANSITIONS_PATH);
}

export function appendTransition(root: string, transition: TransitionRecord): void {
  validateTransitionRecord(transition);
  appendJsonLine(transitionsPath(root), transition);
}

export function seedTransitionHistory(root: string, transition: TransitionRecord): TransitionRecord {
  validateTransitionRecord(transition);
  overwriteTransitions(root, [transition]);
  return transition;
}

export function loadLocks(root: string): LockRecord[] {
  const lockDir = resolveRepoPath(root, LOCKS_DIR);
  return listFiles(lockDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const record = readJsonFile<LockRecord>(join(lockDir, fileName));
      validateLockRecord(record);
      return record;
    });
}

export function writeSchemaFiles(root: string): void {
  for (const [fileName, schema] of [
    ...schemaFileEntries,
    ...runtimeSchemaFileEntries,
    ...synthSchemaFileEntries,
    ...verifySchemaFileEntries,
    ...recoverySchemaFileEntries,
    ...auditSchemaFileEntries,
    ...learningSchemaFileEntries,
    ...parallelSchemaFileEntries,
  ]) {
    writeJsonFile(resolveRepoPath(root, `.supercodex/schemas/${fileName}`), schema);
  }
}

export function computeNextEligibleItem(queue: QueueState): QueueItem | null {
  const completed = new Set(queue.items.filter((item) => item.status === "done").map((item) => item.unit_id));

  for (const item of queue.items) {
    if (item.status !== "ready") {
      continue;
    }

    const isEligible = item.depends_on.every((dependency) => completed.has(dependency));
    if (isEligible) {
      return item;
    }
  }

  return null;
}

export function buildReconciledState(root: string): CurrentState {
  const current = loadCurrentState(root);
  const queue = loadQueueState(root);
  const transitions = loadTransitions(root);
  const nextItem = computeNextEligibleItem(queue);
  const latestTransition = transitions.at(-1) ?? null;

  return {
    ...current,
    queue_head: nextItem?.unit_id ?? null,
    git: reconcileGitState(root, current.git),
    last_transition_at: latestTransition?.timestamp ?? null,
  };
}

export function reconcileState(root: string): CurrentState {
  const nextState = buildReconciledState(root);
  saveCurrentState(root, nextState);
  return nextState;
}

function assertTransitionAllowed(from: Phase, to: Phase): void {
  if (from === to) {
    throw new Error(`Phase is already ${to}.`);
  }

  if (to === "recover" || to === "awaiting_human" || to === "blocked") {
    return;
  }

  const allowed = TRANSITION_RULES[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Transition ${from} -> ${to} is not allowed.`);
  }
}

function stateFieldsFromUnitId(unitId: string): Partial<CurrentState> {
  const parsed = parseUnitId(unitId);
  if (parsed.kind === "unknown") {
    throw new Error(`Unsupported unit id: ${unitId}`);
  }

  return {
    active_milestone: parsed.milestone_id ?? null,
    active_slice: parsed.slice_id ?? null,
    active_task: parsed.task_id ?? null,
  };
}

function applyStatusForPhase(phase: Phase): Pick<CurrentState, "blocked" | "awaiting_human"> {
  if (phase === "blocked") {
    return { blocked: true, awaiting_human: false };
  }

  if (phase === "awaiting_human") {
    return { blocked: false, awaiting_human: true };
  }

  return { blocked: false, awaiting_human: false };
}

export function transitionState(
  root: string,
  phase: Phase,
  reason: string,
  unitId?: string,
  actor = "cli",
): CurrentState {
  const current = buildReconciledState(root);
  assertTransitionAllowed(current.phase, phase);

  const timestamp = new Date().toISOString();
  const unitFields = unitId ? stateFieldsFromUnitId(unitId) : {};
  const statusFlags = applyStatusForPhase(phase);
  const nextState: CurrentState = {
    ...current,
    ...unitFields,
    ...statusFlags,
    phase,
    last_transition_at: timestamp,
  };

  const transition: TransitionRecord = {
    timestamp,
    from_phase: current.phase,
    to_phase: phase,
    reason,
    actor,
    unit_id: unitId,
    queue_head: nextState.queue_head,
    blocked: nextState.blocked,
    awaiting_human: nextState.awaiting_human,
  };

  appendTransition(root, transition);
  saveCurrentState(root, nextState);
  return reconcileState(root);
}

export function addQueueItem(root: string, item: QueueItem): QueueState {
  const queue = loadQueueState(root);
  if (queue.items.some((existing) => existing.unit_id === item.unit_id)) {
    throw new Error(`Queue item ${item.unit_id} already exists.`);
  }

  if (item.depends_on.includes(item.unit_id)) {
    throw new Error("Queue item cannot depend on itself.");
  }

  const nextQueue = {
    ...queue,
    items: [...queue.items, item],
  };

  saveQueueState(root, nextQueue);
  reconcileState(root);
  return nextQueue;
}

export function markQueueItemDone(root: string, unitId: string): QueueState {
  const queue = loadQueueState(root);
  const nextQueue = {
    ...queue,
    items: queue.items.map((item) =>
      item.unit_id === unitId
        ? {
            ...item,
            status: "done" as const,
          }
        : item,
    ),
  };

  if (!nextQueue.items.some((item) => item.unit_id === unitId)) {
    throw new Error(`Queue item ${unitId} was not found.`);
  }

  saveQueueState(root, nextQueue);
  reconcileState(root);
  return nextQueue;
}

export function removeQueueItem(root: string, unitId: string): QueueState {
  const queue = loadQueueState(root);
  const nextItems = queue.items.filter((item) => item.unit_id !== unitId);
  if (nextItems.length === queue.items.length) {
    throw new Error(`Queue item ${unitId} was not found.`);
  }

  const nextQueue = {
    ...queue,
    items: nextItems,
  };

  saveQueueState(root, nextQueue);
  reconcileState(root);
  return nextQueue;
}

function lockPath(root: string, resource: string): string {
  const safeName = resource.replaceAll("/", "__");
  return resolveRepoPath(root, `${LOCKS_DIR}/${safeName}.json`);
}

export function acquireLock(root: string, record: LockRecord): LockRecord {
  validateLockRecord(record);
  const path = lockPath(root, record.resource);
  if (fileExists(path)) {
    throw new Error(`Lock already exists for ${record.resource}.`);
  }

  writeJsonFile(path, record);
  return record;
}

export function releaseLock(root: string, resource: string): boolean {
  const path = lockPath(root, resource);
  if (!fileExists(path)) {
    throw new Error(`Lock ${resource} was not found.`);
  }

  removeFile(path);
  return true;
}

export interface DoctorResult {
  ok: boolean;
  issues: string[];
}

function usesPhaseFiveVerification(unitId: string): boolean {
  const parsed = parseUnitId(unitId);
  if (!parsed.milestone_id) {
    return false;
  }

  const match = /^M(\d{3})$/.exec(parsed.milestone_id);
  return !!match && Number.parseInt(match[1], 10) >= 5;
}

function recoveryRunIdFromRef(recoveryRef: string | null): string | null {
  if (!recoveryRef) {
    return null;
  }

  const match = /\.supercodex\/runs\/([^/]+)\/continue\.md$/.exec(recoveryRef);
  return match?.[1] ?? null;
}

function recoveryDoctorIssues(root: string, current: CurrentState): string[] {
  const issues: string[] = [];
  const recoveryRunId = current.current_run_id ?? recoveryRunIdFromRef(current.recovery_ref);

  if (current.recovery_ref && !fileExists(resolveRepoPath(root, current.recovery_ref))) {
    issues.push(`recovery_ref points at a missing file: ${current.recovery_ref}`);
  }

  if (!recoveryRunId) {
    if (current.phase === "recover") {
      issues.push("current phase recover has no current_run_id or recovery_ref.");
    }
    return issues;
  }

  const paths = getCanonicalRunPaths(recoveryRunId);
  if (!fileExists(resolveRepoPath(root, paths.record_ref))) {
    issues.push(`Recovery run ${recoveryRunId} is missing record.json.`);
    return issues;
  }

  if (current.recovery_ref && current.recovery_ref !== paths.continuation_ref) {
    issues.push(`recovery_ref mismatch: current=${current.recovery_ref} expected=${paths.continuation_ref}`);
  }

  if (!fileExists(resolveRepoPath(root, paths.continuation_json_ref))) {
    issues.push(`Recovery run ${recoveryRunId} is missing continuation.json.`);
  }

  const checkpointFiles = listFiles(resolveRepoPath(root, paths.checkpoints_dir)).filter((fileName) => fileName.endsWith(".json"));
  if (checkpointFiles.length === 0) {
    issues.push(`Recovery run ${recoveryRunId} has no recovery checkpoints.`);
  }

  if (current.phase === "recover" && current.active_task && current.active_milestone && current.active_slice) {
    const verificationState = getTaskVerificationState(root, `${current.active_milestone}/${current.active_slice}/${current.active_task}`);
    if (verificationState.status === "complete") {
      issues.push(`current phase recover is stale because ${current.active_milestone}/${current.active_slice}/${current.active_task} is already complete.`);
    }
  }

  return issues;
}

function vaultMetadataDoctorIssues(root: string): string[] {
  const issues: string[] = [];
  const milestoneDirs = listFiles(resolveRepoPath(root, "vault/milestones")).filter((entry) => /^M\d{3}$/.test(entry));
  const roadmap = fileExists(resolveRepoPath(root, "vault/roadmap.md")) ? readText(resolveRepoPath(root, "vault/roadmap.md")) : "";
  const index = fileExists(resolveRepoPath(root, "vault/index.md")) ? readText(resolveRepoPath(root, "vault/index.md")) : "";
  const milestoneReadme = fileExists(resolveRepoPath(root, "vault/milestones/README.md"))
    ? readText(resolveRepoPath(root, "vault/milestones/README.md"))
    : "";

  for (const milestoneId of milestoneDirs) {
    if (!milestoneReadme.includes(`\`${milestoneId}/\``)) {
      issues.push(`vault/milestones/README.md does not list ${milestoneId}/.`);
    }
    if (!roadmap.includes(`\`${milestoneId}\``)) {
      issues.push(`vault/roadmap.md does not mention ${milestoneId}.`);
    }
    if (!index.includes(`\`${milestoneId}\``)) {
      issues.push(`vault/index.md does not mention ${milestoneId}.`);
    }
  }

  return issues;
}

function parallelDoctorIssues(root: string): string[] {
  const issues: string[] = [];
  const parallelPath = resolveRepoPath(root, PARALLEL_STATE_PATH);
  const integrationPath = resolveRepoPath(root, INTEGRATION_STATE_PATH);

  if (!fileExists(parallelPath) || !fileExists(integrationPath)) {
    return issues;
  }

  const parallel = readJsonFile<unknown>(parallelPath);
  validateParallelState(parallel);
  const integration = readJsonFile<unknown>(integrationPath);
  validateIntegrationState(integration);

  const workerFiles = listFiles(resolveRepoPath(root, WORKERS_DIR)).filter((fileName) => fileName.endsWith(".json"));
  const workerIdsFromDisk = workerFiles.map((fileName) => fileName.replace(/\.json$/, "")).sort();
  const workerIdsFromState = [...parallel.worker_ids].sort();
  if (workerIdsFromDisk.join("\n") !== workerIdsFromState.join("\n")) {
    issues.push("parallel worker ids do not match .supercodex/state/workers contents.");
  }

  const locks = loadLocks(root);
  for (const workerId of parallel.worker_ids) {
    const workerRef = resolveRepoPath(root, `${WORKERS_DIR}/${workerId}.json`);
    if (!fileExists(workerRef)) {
      issues.push(`Missing worker state file for ${workerId}.`);
      continue;
    }

    const worker = readJsonFile<unknown>(workerRef);
    validateWorkerState(worker);
    const typed = worker as {
      unit_id: string;
      worktree_path: string;
      owned_resources: string[];
      queue_status: string;
      canonical_commit: string | null;
    };
    if (!fileExists(typed.worktree_path)) {
      issues.push(`Worker ${workerId} worktree is missing: ${typed.worktree_path}`);
    }

    for (const resource of typed.owned_resources) {
      const match = locks.find((lock) => lock.resource === resource);
      if (!match || match.worker_id !== workerId) {
        issues.push(`Worker ${workerId} is missing a matching lock for ${resource}.`);
      }
    }

    if (typed.queue_status === "ready_to_integrate" && !typed.canonical_commit) {
      issues.push(`Worker ${workerId} is ready_to_integrate without a canonical_commit.`);
    }
  }

  for (const entry of integration.queue) {
    if (!parallel.worker_ids.includes(entry.worker_id)) {
      issues.push(`Integration queue item ${entry.unit_id} references missing worker ${entry.worker_id}.`);
    }
  }

  return issues;
}

function learningDoctorIssues(root: string): string[] {
  const issues: string[] = [];
  const learningPath = resolveRepoPath(root, LEARNING_STATE_PATH);
  if (!fileExists(learningPath)) {
    return issues;
  }

  const learning = readJsonFile<unknown>(learningPath);
  validateLearningState(learning);
  const typed = learning as {
    latest_skill_health_ref: string | null;
    latest_roadmap_report_ref: string | null;
    latest_process_report_ref: string | null;
    latest_pattern_candidate_refs: string[];
    processed_slice_unit_ids: string[];
    processed_postmortem_run_ids: string[];
  };

  const seenSlices = new Set<string>();
  for (const unitId of typed.processed_slice_unit_ids) {
    if (seenSlices.has(unitId)) {
      issues.push(`learning state contains duplicate processed slice id ${unitId}.`);
    }
    seenSlices.add(unitId);
  }

  const seenRuns = new Set<string>();
  for (const runId of typed.processed_postmortem_run_ids) {
    if (seenRuns.has(runId)) {
      issues.push(`learning state contains duplicate processed postmortem run id ${runId}.`);
    }
    seenRuns.add(runId);
  }

  for (const ref of [
    typed.latest_skill_health_ref,
    typed.latest_roadmap_report_ref,
    typed.latest_process_report_ref,
    ...typed.latest_pattern_candidate_refs,
  ].filter(Boolean) as string[]) {
    if (!fileExists(resolveRepoPath(root, ref))) {
      issues.push(`learning state points at a missing artifact: ${ref}`);
    }
  }

  if (typed.latest_skill_health_ref && fileExists(resolveRepoPath(root, typed.latest_skill_health_ref))) {
    const snapshot = readJsonFile<unknown>(resolveRepoPath(root, typed.latest_skill_health_ref));
    validateSkillHealthSnapshot(snapshot);
    for (const skill of (snapshot as { skills: Array<{ skill_id: string; skill_ref: string }> }).skills) {
      if (!fileExists(resolveRepoPath(root, skill.skill_ref))) {
        issues.push(`skill health snapshot references missing skill ${skill.skill_id} at ${skill.skill_ref}.`);
      }
    }
  }

  for (const fileName of listFiles(resolveRepoPath(root, LEARNING_PATTERNS_DIR)).filter((entry) => entry.endsWith(".json"))) {
    const ref = `${LEARNING_PATTERNS_DIR}/${fileName}`;
    const candidate = readJsonFile<unknown>(resolveRepoPath(root, ref));
    validatePatternCandidate(candidate);
    for (const evidenceRef of (candidate as { evidence_refs: string[] }).evidence_refs) {
      if (!fileExists(resolveRepoPath(root, evidenceRef))) {
        issues.push(`pattern candidate ${ref} points at missing evidence ${evidenceRef}.`);
      }
    }
  }

  for (const fileName of listFiles(resolveRepoPath(root, LEARNING_ROADMAP_DIR)).filter((entry) => entry.endsWith(".json"))) {
    const ref = `${LEARNING_ROADMAP_DIR}/${fileName}`;
    const report = readJsonFile<unknown>(resolveRepoPath(root, ref));
    validateRoadmapReassessmentReport(report);
    for (const evidenceRef of (report as { evidence_refs: string[] }).evidence_refs) {
      if (!fileExists(resolveRepoPath(root, evidenceRef))) {
        issues.push(`roadmap reassessment ${ref} points at missing evidence ${evidenceRef}.`);
      }
    }
  }

  for (const fileName of listFiles(resolveRepoPath(root, LEARNING_PROCESS_DIR)).filter((entry) => entry.endsWith(".json"))) {
    const ref = `${LEARNING_PROCESS_DIR}/${fileName}`;
    const report = readJsonFile<unknown>(resolveRepoPath(root, ref));
    validateProcessImprovementReport(report);
    for (const evidenceRef of (report as { evidence_refs: string[] }).evidence_refs) {
      if (!fileExists(resolveRepoPath(root, evidenceRef))) {
        issues.push(`process improvement report ${ref} points at missing evidence ${evidenceRef}.`);
      }
    }
  }

  const knownSkills = new Set(listFiles(resolveRepoPath(root, "skills")).filter((name) => fileExists(resolveRepoPath(root, `skills/${name}/SKILL.md`))));
  for (const runDir of listFiles(resolveRepoPath(root, ".supercodex/runs"))) {
    const recordPath = resolveRepoPath(root, `.supercodex/runs/${runDir}/record.json`);
    if (!fileExists(recordPath)) {
      continue;
    }

    const runRecord = readJsonFile<{
      run_id: string;
      skills_used?: Array<{ skill_id: string }>;
    }>(recordPath);
    for (const skill of runRecord.skills_used ?? []) {
      if (!knownSkills.has(skill.skill_id)) {
        issues.push(`canonical run ${runRecord.run_id} references unknown project skill id ${skill.skill_id}.`);
      }
    }
  }

  if (typed.latest_skill_health_ref === null && listFiles(resolveRepoPath(root, LEARNING_SKILLS_DIR)).some((entry) => entry.endsWith(".json"))) {
    issues.push("learning state is missing latest_skill_health_ref even though skill health artifacts exist.");
  }

  return issues;
}

export function runDoctor(root: string, placeholderFiles: string[]): DoctorResult {
  const issues: string[] = [];

  for (const relativePath of [
    CURRENT_STATE_PATH,
    QUEUE_STATE_PATH,
    TRANSITIONS_PATH,
    ".supercodex/runtime/adapters.json",
    ".supercodex/runtime/routing.json",
    ".supercodex/runtime/policies.json",
    PARALLEL_STATE_PATH,
    INTEGRATION_STATE_PATH,
    LEARNING_STATE_PATH,
    ".supercodex/prompts/dispatch.json",
    "vault/vision.md",
    "vault/roadmap.md",
    "vault/index.md",
  ]) {
    if (!fileExists(resolveRepoPath(root, relativePath))) {
      issues.push(`Missing required file: ${relativePath}`);
    }
  }

  issues.push(...placeholderFiles.map((file) => `Placeholder content remains in ${file}`));
  issues.push(...vaultMetadataDoctorIssues(root));
  issues.push(...parallelDoctorIssues(root));
  issues.push(...learningDoctorIssues(root));

  try {
    const current = loadCurrentState(root);
    issues.push(...recoveryDoctorIssues(root, current));
    if (current.active_milestone) {
      for (const milestoneFile of [
        `vault/milestones/${current.active_milestone}/milestone.md`,
        `vault/milestones/${current.active_milestone}/boundary-map.md`,
        `vault/milestones/${current.active_milestone}/summary.md`,
        `vault/milestones/${current.active_milestone}/uat.md`,
      ]) {
        if (!fileExists(resolveRepoPath(root, milestoneFile))) {
          issues.push(`Missing active milestone artifact: ${milestoneFile}`);
        }
      }
    }

    if (current.active_task && current.active_milestone && current.active_slice) {
      const validation = validatePlanningUnit(root, `${current.active_milestone}/${current.active_slice}/${current.active_task}`);
      if (!validation.ok) {
        issues.push(...validation.issues);
      }

      const activeTaskUnitId = `${current.active_milestone}/${current.active_slice}/${current.active_task}`;
      if (usesPhaseFiveVerification(activeTaskUnitId) && ["verify", "review", "complete_task", "complete_slice"].includes(current.phase)) {
        issues.push(...verificationDoctorIssues(root, activeTaskUnitId));
      }
    } else if (current.active_slice && current.active_milestone && isModernMilestone(current.active_milestone)) {
      const validation = validatePlanningUnit(root, `${current.active_milestone}/${current.active_slice}`);
      if (!validation.ok) {
        issues.push(...validation.issues);
      }
    } else if (current.active_milestone && isModernMilestone(current.active_milestone)) {
      const validation = validatePlanningUnit(root, current.active_milestone);
      if (!validation.ok) {
        issues.push(...validation.issues);
      }
    }

    const queue = loadQueueState(root);
    const nextEligible = computeNextEligibleItem(queue);
    if (current.queue_head !== (nextEligible?.unit_id ?? null)) {
      issues.push(
        `queue_head mismatch: current=${String(current.queue_head)} expected=${String(nextEligible?.unit_id ?? null)}`,
      );
    }

    for (const item of queue.items) {
      if (item.unit_type === "task" && item.status === "done" && usesPhaseFiveVerification(item.unit_id)) {
        issues.push(...verificationDoctorIssues(root, item.unit_id));
      }
    }

    const transitions = loadTransitions(root);
    if (transitions.length === 0) {
      if (current.last_transition_at !== null) {
        issues.push("current.json has last_transition_at but no transition history.");
      }
    } else {
      const latest = transitions.at(-1)!;
      if (current.phase !== latest.to_phase) {
        issues.push(`current phase ${current.phase} does not match latest transition ${latest.to_phase}.`);
      }

      if (current.last_transition_at !== latest.timestamp) {
        issues.push(
          `current last_transition_at ${String(current.last_transition_at)} does not match latest transition ${latest.timestamp}.`,
        );
      }

      if (current.blocked !== latest.blocked) {
        issues.push("current blocked flag does not match latest transition.");
      }

      if (current.awaiting_human !== latest.awaiting_human) {
        issues.push("current awaiting_human flag does not match latest transition.");
      }
    }

    loadLocks(root);
    loadRuntimeRegistry(root);
    loadDispatchTemplate(root);
    const reconciled = buildReconciledState(root);
    if (reconciled.git.dirty !== current.git.dirty) {
      issues.push(`git dirty mismatch: current=${current.git.dirty} expected=${reconciled.git.dirty}`);
    }

    if (reconciled.git.head_commit !== current.git.head_commit) {
      issues.push(
        `git head commit mismatch: current=${String(current.git.head_commit)} expected=${String(reconciled.git.head_commit)}`,
      );
    }

    if (!fileExists(resolveRepoPath(root, ".git"))) {
      issues.push("Repository is not initialized under git.");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function listLockResources(root: string): string[] {
  return loadLocks(root).map((record) => record.resource);
}

export function lockFileNames(root: string): string[] {
  return listFiles(resolveRepoPath(root, LOCKS_DIR)).filter((fileName) => fileName.endsWith(".json"));
}

export function lockBasenames(root: string): string[] {
  return lockFileNames(root).map((fileName) => basename(fileName));
}
