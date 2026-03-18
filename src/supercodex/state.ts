import { basename, join } from "node:path";

import {
  appendJsonLine,
  fileExists,
  listFiles,
  readJsonFile,
  readJsonLines,
  removeFile,
  writeJsonFile,
  writeTextAtomic,
} from "./fs.js";
import { reconcileGitState } from "./git.js";
import { CURRENT_STATE_PATH, LOCKS_DIR, QUEUE_STATE_PATH, resolveRepoPath, TRANSITIONS_PATH } from "./paths.js";
import {
  schemaFileEntries,
  validateCurrentState,
  validateLockRecord,
  validateQueueState,
  validateTransitionRecord,
} from "./schemas.js";
import { isModernMilestone, parseUnitId, validatePlanningUnit } from "./planning/index.js";
import { loadDispatchTemplate, loadRuntimeRegistry } from "./runtime/registry.js";
import { runtimeSchemaFileEntries } from "./runtime/schemas.js";
import { synthSchemaFileEntries } from "./synth/schemas.js";
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
  dispatch: ["plan", "implement"],
  implement: ["verify"],
  verify: ["implement", "review"],
  review: ["implement", "integrate", "complete_task"],
  integrate: ["complete_task", "complete_slice"],
  complete_task: ["reassess", "dispatch", "complete_slice"],
  complete_slice: ["reassess", "complete"],
  reassess: ["plan", "dispatch", "complete"],
  recover: ["plan", "dispatch", "implement", "verify", "review", "integrate", "complete_task", "complete_slice", "complete"],
  awaiting_human: ["recover", "plan", "dispatch", "implement"],
  blocked: ["recover", "plan", "dispatch", "implement"],
  complete: [],
};

export function loadCurrentState(root: string): CurrentState {
  const current = readJsonFile<CurrentState>(resolveRepoPath(root, CURRENT_STATE_PATH));
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
  for (const [fileName, schema] of [...schemaFileEntries, ...runtimeSchemaFileEntries, ...synthSchemaFileEntries]) {
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

export function runDoctor(root: string, placeholderFiles: string[]): DoctorResult {
  const issues: string[] = [];

  for (const relativePath of [
    CURRENT_STATE_PATH,
    QUEUE_STATE_PATH,
    TRANSITIONS_PATH,
    ".supercodex/runtime/adapters.json",
    ".supercodex/runtime/routing.json",
    ".supercodex/runtime/policies.json",
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

  try {
    const current = loadCurrentState(root);
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
