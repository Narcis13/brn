import { readdirSync } from "node:fs";

import { fileExists, readJsonFile, readText, readTextIfExists, writeJsonFile } from "../fs.js";
import { CURRENT_STATE_PATH, QUEUE_STATE_PATH, isPlaceholderContent, resolveRepoPath } from "../paths.js";
import { validateCurrentState, validateQueueState } from "../schemas.js";
import type { CurrentState, QueueItem, QueueState, QueueStatus, UnitType } from "../types.js";
import type {
  ParsedTaskArtifact,
  ParsedUnitId,
  PlanningMode,
  PlanningQueueSyncResult,
  PlanningValidationResult,
  QueueItemDraft,
  QueueMergeResult,
  TaskTddMode,
  VerificationPlanBuckets,
} from "./types.js";
import { TASK_TDD_MODES } from "./types.js";

const ROADMAP_UNIT_ID = "ROADMAP";
const MODERN_MILESTONE_MIN = 4;
const TASK_FILE_RE = /^T\d{2}\.md$/;
const MILESTONE_DIR_RE = /^M\d{3}$/;
const SLICE_DIR_RE = /^S\d{2}$/;

const LEGACY_SLICE_FILES = ["slice.md", "research.md", "plan.md"] as const;
const MODERN_SLICE_FILES = ["slice.md", "boundary-map.md", "research.md", "plan.md", "review.md", "summary.md"] as const;
const MILESTONE_FILES = ["milestone.md", "boundary-map.md", "summary.md", "uat.md"] as const;
const TASK_SECTION_ORDER = [
  "Objective",
  "Why Now",
  "Acceptance Criteria",
  "TDD Mode",
  "Likely Files",
  "Verification Plan",
  "Dependencies",
  "Safety Class",
  "Status",
  "Summary",
] as const;

function emptyVerificationPlanBuckets(): VerificationPlanBuckets {
  return {
    static: [],
    focused_tests: [],
    behavioral: [],
    slice_regression: [],
    milestone_regression: [],
    human_uat: [],
  };
}

function classifyVerificationStep(step: string): keyof VerificationPlanBuckets {
  const normalized = step.trim().toLowerCase();

  if (/(human|manual|uat)/.test(normalized)) {
    return "human_uat";
  }

  if (/milestone/.test(normalized)) {
    return "milestone_regression";
  }

  if (/slice/.test(normalized)) {
    return "slice_regression";
  }

  if (/(pnpm|npm|npx|vitest|tsx)\b/.test(normalized) || /\btest(s)?\b/.test(normalized)) {
    return "focused_tests";
  }

  if (/(inspect|browser|curl|http|response|api|cli|run\b|smoke)/.test(normalized)) {
    return "behavioral";
  }

  return "static";
}

function bucketVerificationPlan(steps: string[]): VerificationPlanBuckets {
  const buckets = emptyVerificationPlanBuckets();

  for (const step of steps) {
    buckets[classifyVerificationStep(step)].push(step);
  }

  return buckets;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function loadCurrentStateFile(root: string): CurrentState {
  const current = readJsonFile<CurrentState>(resolveRepoPath(root, CURRENT_STATE_PATH));
  validateCurrentState(current);
  return current;
}

function loadQueueStateFile(root: string): QueueState {
  const queue = readJsonFile<QueueState>(resolveRepoPath(root, QUEUE_STATE_PATH));
  validateQueueState(queue);
  return queue;
}

export function parseUnitId(unitId: string): ParsedUnitId {
  if (unitId === ROADMAP_UNIT_ID) {
    return {
      raw: unitId,
      kind: "roadmap",
      milestone_id: null,
      slice_id: null,
      task_id: null,
    };
  }

  const match = /^(M\d{3})(?:\/(S\d{2})(?:\/(T\d{2}))?)?$/.exec(unitId);
  if (!match) {
    return {
      raw: unitId,
      kind: "unknown",
      milestone_id: null,
      slice_id: null,
      task_id: null,
    };
  }

  return {
    raw: unitId,
    kind: match[3] ? "task" : match[2] ? "slice" : "milestone",
    milestone_id: match[1] ?? null,
    slice_id: match[2] ?? null,
    task_id: match[3] ?? null,
  };
}

export function assertSupportedUnitId(unitId: string): ParsedUnitId {
  const parsed = parseUnitId(unitId);
  if (parsed.kind === "unknown") {
    throw new Error(`Unsupported unit id: ${unitId}`);
  }
  return parsed;
}

function milestoneNumber(milestoneId: string | null): number | null {
  if (!milestoneId) {
    return null;
  }

  const match = /^M(\d{3})$/.exec(milestoneId);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function isModernMilestone(milestoneId: string | null): boolean {
  const number = milestoneNumber(milestoneId);
  return number !== null && number >= MODERN_MILESTONE_MIN;
}

function sliceRoot(root: string, milestoneId: string, sliceId: string): string {
  return resolveRepoPath(root, `vault/milestones/${milestoneId}/slices/${sliceId}`);
}

function taskRoot(root: string, milestoneId: string, sliceId: string): string {
  return resolveRepoPath(root, `vault/milestones/${milestoneId}/slices/${sliceId}/tasks`);
}

function milestoneRoot(root: string, milestoneId: string): string {
  return resolveRepoPath(root, `vault/milestones/${milestoneId}`);
}

function relativeRefs(base: string, names: readonly string[]): string[] {
  return names.map((name) => `${base}/${name}`);
}

function listDirs(path: string, pattern: RegExp): string[] {
  if (!fileExists(path)) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function listMilestoneIds(root: string): string[] {
  return listDirs(resolveRepoPath(root, "vault/milestones"), MILESTONE_DIR_RE);
}

export function listSliceIds(root: string, milestoneId: string): string[] {
  return listDirs(resolveRepoPath(root, `vault/milestones/${milestoneId}/slices`), SLICE_DIR_RE);
}

export function listTaskIds(root: string, milestoneId: string, sliceId: string): string[] {
  const directory = taskRoot(root, milestoneId, sliceId);
  if (!fileExists(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .sort();
}

export function isModernSlice(root: string, milestoneId: string, sliceId: string): boolean {
  return (
    isModernMilestone(milestoneId) ||
    fileExists(resolveRepoPath(root, `vault/milestones/${milestoneId}/slices/${sliceId}/boundary-map.md`)) ||
    fileExists(resolveRepoPath(root, `vault/milestones/${milestoneId}/slices/${sliceId}/tasks`))
  );
}

function loadMarkdown(root: string, ref: string): string {
  return readTextIfExists(resolveRepoPath(root, ref)) ?? "";
}

function missingRefs(root: string, refs: string[]): string[] {
  return refs.filter((ref) => !fileExists(resolveRepoPath(root, ref)));
}

function parseSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const rawLine of text.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(rawLine.trim());
    if (heading) {
      current = heading[1] ?? null;
      if (current) {
        sections.set(current, []);
      }
      continue;
    }

    if (!current) {
      continue;
    }

    sections.get(current)?.push(rawLine);
  }

  return sections;
}

function readScalarSection(sections: Map<string, string[]>, heading: string): string {
  return (sections.get(heading) ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function readBulletSection(sections: Map<string, string[]>, heading: string): string[] {
  return (sections.get(heading) ?? [])
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function isNoneValue(value: string): boolean {
  return /^(none|n\/a)$/i.test(value.trim());
}

export function loadTaskArtifact(root: string, milestoneId: string, sliceId: string, taskId: string): ParsedTaskArtifact {
  const ref = `vault/milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}.md`;
  const text = readText(resolveRepoPath(root, ref));
  const sections = parseSections(text);
  const issues: string[] = [];

  for (const heading of TASK_SECTION_ORDER) {
    if (!sections.has(heading)) {
      issues.push(`Missing section "## ${heading}" in ${ref}.`);
    }
  }

  const objective = readScalarSection(sections, "Objective");
  const whyNow = readScalarSection(sections, "Why Now");
  const acceptanceCriteria = readBulletSection(sections, "Acceptance Criteria");
  const tddMode = readScalarSection(sections, "TDD Mode");
  const tddJustification = readScalarSection(sections, "TDD Justification");
  const likelyFiles = readBulletSection(sections, "Likely Files");
  const verificationPlan = readBulletSection(sections, "Verification Plan");
  const reviewerPasses = readBulletSection(sections, "Reviewer Passes");
  const dependencyLines = readBulletSection(sections, "Dependencies");
  const safetyClass = readScalarSection(sections, "Safety Class");
  const status = readScalarSection(sections, "Status");
  const summary = readScalarSection(sections, "Summary");

  if (!objective) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} is missing Objective content.`);
  }
  if (!whyNow) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} is missing Why Now content.`);
  }
  if (acceptanceCriteria.length === 0) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} must declare at least one acceptance criterion.`);
  }
  if (!TASK_TDD_MODES.includes(tddMode as TaskTddMode)) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} has unsupported TDD mode: ${tddMode || "<missing>"}.`);
  }
  const usesPhaseFiveContract = (milestoneNumber(milestoneId) ?? 0) >= 5;
  if (
    usesPhaseFiveContract &&
    (tddMode === "brownfield_tdd" || tddMode === "verification_first") &&
    !tddJustification
  ) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} must explain why ${tddMode} is required.`);
  }
  if (likelyFiles.length === 0) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} must list likely files.`);
  }
  if (verificationPlan.length === 0) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} must list verification steps.`);
  }
  if (!safetyClass) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} is missing Safety Class.`);
  }
  if (!status) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} is missing Status.`);
  }
  if (!summary) {
    issues.push(`Task ${milestoneId}/${sliceId}/${taskId} is missing Summary content.`);
  }

  const dependencies = dependencyLines.filter((value) => !isNoneValue(value));
  for (const dependency of dependencies) {
    if (parseUnitId(dependency).kind === "unknown") {
      issues.push(`Task ${milestoneId}/${sliceId}/${taskId} has invalid dependency: ${dependency}.`);
    }
  }

  if (issues.length > 0) {
    throw new Error(issues.join(" "));
  }

  return {
    unit_id: `${milestoneId}/${sliceId}/${taskId}`,
    objective,
    why_now: whyNow,
    acceptance_criteria: acceptanceCriteria,
    tdd_mode: tddMode as TaskTddMode,
    tdd_justification: tddJustification || null,
    likely_files: likelyFiles,
    verification_plan: verificationPlan,
    verification_ladder: bucketVerificationPlan(verificationPlan),
    reviewer_passes: reviewerPasses,
    dependencies,
    safety_class: safetyClass,
    status,
    summary,
  };
}

function validateRoadmap(root: string): PlanningValidationResult {
  const ref = "vault/roadmap.md";
  const issues: string[] = [];

  if (!fileExists(resolveRepoPath(root, ref))) {
    issues.push(`Missing required roadmap artifact: ${ref}`);
  } else if (isPlaceholderContent(ref, loadMarkdown(root, ref))) {
    issues.push(`${ref} still contains placeholder content.`);
  }

  return {
    unit_id: ROADMAP_UNIT_ID,
    unit_type: "roadmap",
    mode: "legacy",
    ok: issues.length === 0,
    issues,
    refs: [ref],
    tasks: [],
  };
}

function validateMilestone(root: string, milestoneId: string): PlanningValidationResult {
  const base = `vault/milestones/${milestoneId}`;
  const refs = relativeRefs(base, MILESTONE_FILES);
  const issues = missingRefs(root, refs).map((ref) => `Missing required milestone artifact: ${ref}`);
  const slices = listSliceIds(root, milestoneId);
  const mode: PlanningMode = isModernMilestone(milestoneId) ? "modern" : "legacy";

  if (mode === "modern") {
    if (slices.length === 0) {
      issues.push(`Milestone ${milestoneId} does not define any slices.`);
    }

    for (const sliceId of slices) {
      const sliceBase = `vault/milestones/${milestoneId}/slices/${sliceId}`;
      const scaffoldRefs = relativeRefs(sliceBase, MODERN_SLICE_FILES);
      for (const ref of missingRefs(root, scaffoldRefs)) {
        issues.push(`Missing required slice scaffold: ${ref}`);
      }
    }
  }

  return {
    unit_id: milestoneId,
    unit_type: "milestone",
    mode,
    ok: issues.length === 0,
    issues,
    refs,
    tasks: [],
  };
}

function validateSlice(root: string, milestoneId: string, sliceId: string): PlanningValidationResult {
  const modern = isModernSlice(root, milestoneId, sliceId);
  const mode: PlanningMode = modern ? "modern" : "legacy";
  const base = `vault/milestones/${milestoneId}/slices/${sliceId}`;
  const refs = relativeRefs(base, modern ? MODERN_SLICE_FILES : LEGACY_SLICE_FILES);
  const issues = missingRefs(root, refs).map((ref) => `Missing required slice artifact: ${ref}`);
  const tasks: ParsedTaskArtifact[] = [];

  if (modern) {
    const taskIds = listTaskIds(root, milestoneId, sliceId);
    if (taskIds.length === 0) {
      issues.push(`Slice ${milestoneId}/${sliceId} does not define any task files under ${base}/tasks/.`);
    }

    for (const taskId of taskIds) {
      try {
        tasks.push(loadTaskArtifact(root, milestoneId, sliceId, taskId));
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return {
    unit_id: `${milestoneId}/${sliceId}`,
    unit_type: "slice",
    mode,
    ok: issues.length === 0,
    issues,
    refs,
    tasks,
  };
}

function validateTask(root: string, milestoneId: string, sliceId: string, taskId: string): PlanningValidationResult {
  const ref = `vault/milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}.md`;

  try {
    const task = loadTaskArtifact(root, milestoneId, sliceId, taskId);
    return {
      unit_id: `${milestoneId}/${sliceId}/${taskId}`,
      unit_type: "task",
      mode: "modern",
      ok: true,
      issues: [],
      refs: [ref],
      tasks: [task],
    };
  } catch (error) {
    return {
      unit_id: `${milestoneId}/${sliceId}/${taskId}`,
      unit_type: "task",
      mode: "modern",
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
      refs: [ref],
      tasks: [],
    };
  }
}

export function validatePlanningUnit(root: string, unitId: string): PlanningValidationResult {
  const parsed = assertSupportedUnitId(unitId);
  switch (parsed.kind) {
    case "roadmap":
      return validateRoadmap(root);
    case "milestone":
      return validateMilestone(root, parsed.milestone_id!);
    case "slice":
      return validateSlice(root, parsed.milestone_id!, parsed.slice_id!);
    case "task":
      return validateTask(root, parsed.milestone_id!, parsed.slice_id!, parsed.task_id!);
    default:
      throw new Error(`Unsupported planning unit: ${unitId}`);
  }
}

export function validatePlanningSurface(root: string, unitId?: string): PlanningValidationResult[] {
  if (unitId) {
    return [validatePlanningUnit(root, unitId)];
  }

  const current = loadCurrentStateFile(root);
  const queue = loadQueueStateFile(root);
  const targets = new Set<string>();

  if (queue.items.some((item) => item.unit_id === ROADMAP_UNIT_ID) || isPlaceholderContent("vault/roadmap.md", loadMarkdown(root, "vault/roadmap.md"))) {
    targets.add(ROADMAP_UNIT_ID);
  }

  for (const item of queue.items) {
    const parsed = parseUnitId(item.unit_id);
    if (parsed.kind === "roadmap" || (parsed.milestone_id && isModernMilestone(parsed.milestone_id))) {
      targets.add(item.unit_id);
    }
  }

  if (current.active_milestone && isModernMilestone(current.active_milestone)) {
    targets.add(current.active_milestone);
    for (const sliceId of listSliceIds(root, current.active_milestone)) {
      targets.add(`${current.active_milestone}/${sliceId}`);
      for (const taskId of listTaskIds(root, current.active_milestone, sliceId)) {
        targets.add(`${current.active_milestone}/${sliceId}/${taskId}`);
      }
    }
  }

  return [...targets].sort().map((target) => validatePlanningUnit(root, target));
}

function mergeQueueItem(existing: QueueItem | undefined, draft: QueueItemDraft): QueueMergeResult {
  const next: QueueItem = {
    unit_id: draft.unit_id,
    unit_type: draft.unit_type,
    status: draft.status,
    depends_on: [...draft.depends_on],
    enqueued_at: existing?.enqueued_at ?? new Date().toISOString(),
    milestone_id: draft.milestone_id,
    slice_id: draft.slice_id,
    task_id: draft.task_id,
    notes: draft.notes,
  };

  if (!existing) {
    return {
      item: next,
      changed: true,
      added: true,
    };
  }

  const changed = JSON.stringify(existing) !== JSON.stringify(next);
  return {
    item: changed ? next : existing,
    changed,
    added: false,
  };
}

function planningStatus(validation: PlanningValidationResult, existing?: QueueItem): QueueStatus {
  if (existing?.status === "active" || existing?.status === "ready_to_integrate") {
    return existing.status;
  }

  if (validation.ok) {
    return "done";
  }

  if (existing?.status === "blocked") {
    return "blocked";
  }

  return "ready";
}

function taskStatus(existing?: QueueItem, allowReady = true): QueueStatus {
  if (existing?.status === "done") {
    return "done";
  }

  if (existing?.status === "active" || existing?.status === "ready_to_integrate") {
    return existing.status;
  }

  if (existing?.status === "blocked") {
    return "blocked";
  }

  return allowReady ? "ready" : "blocked";
}

function targetMilestones(current: CurrentState, queue: QueueState): string[] {
  const ids = new Set<string>();

  if (current.active_milestone && isModernMilestone(current.active_milestone)) {
    ids.add(current.active_milestone);
  }

  for (const item of queue.items) {
    const parsed = parseUnitId(item.unit_id);
    if (parsed.milestone_id && isModernMilestone(parsed.milestone_id)) {
      ids.add(parsed.milestone_id);
    }
  }

  return [...ids].sort();
}

function refsForManagedSlice(root: string, milestoneId: string, sliceId: string): string[] {
  return relativeRefs(`vault/milestones/${milestoneId}/slices/${sliceId}`, MODERN_SLICE_FILES).filter((ref) =>
    fileExists(resolveRepoPath(root, ref)),
  );
}

export function expectedArtifactsForUnit(root: string, unitId: string): string[] {
  const parsed = assertSupportedUnitId(unitId);

  if (parsed.kind === "roadmap") {
    return ["vault/roadmap.md"];
  }

  if (parsed.kind === "milestone") {
    const base = `vault/milestones/${parsed.milestone_id}`;
    const refs = relativeRefs(base, MILESTONE_FILES);
    if (parsed.milestone_id && isModernMilestone(parsed.milestone_id)) {
      for (const sliceId of listSliceIds(root, parsed.milestone_id)) {
        refs.push(...relativeRefs(`${base}/slices/${sliceId}`, MODERN_SLICE_FILES));
      }
    }
    return unique(refs);
  }

  if (parsed.kind === "slice") {
    const base = `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}`;
    return unique([...relativeRefs(base, MODERN_SLICE_FILES), `${base}/tasks/`]);
  }

  if (parsed.kind === "task") {
    return [
      `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/tasks/${parsed.task_id}.md`,
      `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/summary.md`,
    ];
  }

  return [];
}

export function syncPlanningQueue(root: string): PlanningQueueSyncResult {
  const current = loadCurrentStateFile(root);
  const queue = loadQueueStateFile(root);
  const existingById = new Map(queue.items.map((item) => [item.unit_id, item] as const));
  const nextById = new Map(queue.items.map((item) => [item.unit_id, item] as const));
  const appendedIds: string[] = [];
  const added: string[] = [];
  const updated: string[] = [];
  const validations: PlanningValidationResult[] = [];
  const milestoneIds = targetMilestones(current, queue);

  const roadmapManaged =
    queue.items.some((item) => item.unit_id === ROADMAP_UNIT_ID) ||
    (fileExists(resolveRepoPath(root, "vault/roadmap.md")) &&
      isPlaceholderContent("vault/roadmap.md", loadMarkdown(root, "vault/roadmap.md")));

  if (roadmapManaged) {
    const validation = validateRoadmap(root);
    validations.push(validation);
    const merged = mergeQueueItem(existingById.get(ROADMAP_UNIT_ID), {
      unit_id: ROADMAP_UNIT_ID,
      unit_type: "roadmap",
      status: planningStatus(validation, existingById.get(ROADMAP_UNIT_ID)),
      depends_on: [],
      notes: "Refresh roadmap intent before milestone decomposition continues.",
    });
    nextById.set(ROADMAP_UNIT_ID, merged.item);
    if (merged.changed) {
      (merged.added ? added : updated).push(ROADMAP_UNIT_ID);
    }
    if (merged.added) {
      appendedIds.push(ROADMAP_UNIT_ID);
    }
  }

  for (const milestoneId of milestoneIds) {
    const milestoneValidation = validateMilestone(root, milestoneId);
    validations.push(milestoneValidation);

    const milestoneMerged = mergeQueueItem(existingById.get(milestoneId), {
      unit_id: milestoneId,
      unit_type: "milestone",
      status: planningStatus(milestoneValidation, existingById.get(milestoneId)),
      depends_on: roadmapManaged ? [ROADMAP_UNIT_ID] : [],
      milestone_id: milestoneId,
      notes: `Plan ${milestoneId} into slice scaffolds with explicit contracts.`,
    });
    nextById.set(milestoneId, milestoneMerged.item);
    if (milestoneMerged.changed) {
      (milestoneMerged.added ? added : updated).push(milestoneId);
    }
    if (milestoneMerged.added) {
      appendedIds.push(milestoneId);
    }

    for (const sliceId of listSliceIds(root, milestoneId)) {
      if (!isModernSlice(root, milestoneId, sliceId)) {
        continue;
      }

      const sliceUnitId = `${milestoneId}/${sliceId}`;
      const sliceValidation = validateSlice(root, milestoneId, sliceId);
      validations.push(sliceValidation);

      const sliceMerged = mergeQueueItem(existingById.get(sliceUnitId), {
        unit_id: sliceUnitId,
        unit_type: "slice",
        status: planningStatus(sliceValidation, existingById.get(sliceUnitId)),
        depends_on: [milestoneId],
        milestone_id: milestoneId,
        slice_id: sliceId,
        notes: `Decompose ${sliceUnitId} into bounded, verifiable tasks.`,
      });
      nextById.set(sliceUnitId, sliceMerged.item);
      if (sliceMerged.changed) {
        (sliceMerged.added ? added : updated).push(sliceUnitId);
      }
      if (sliceMerged.added) {
        appendedIds.push(sliceUnitId);
      }

      const existingTaskIds = queue.items
        .filter((item) => item.milestone_id === milestoneId && item.slice_id === sliceId && item.unit_type === "task")
        .map((item) => item.unit_id);

      if (!sliceValidation.ok) {
        for (const taskUnitId of existingTaskIds) {
          const existingTask = existingById.get(taskUnitId);
          if (!existingTask) {
            continue;
          }

          const blockedTask = mergeQueueItem(existingTask, {
            unit_id: taskUnitId,
            unit_type: "task",
            status: taskStatus(existingTask, false),
            depends_on: existingTask.depends_on,
            milestone_id: existingTask.milestone_id,
            slice_id: existingTask.slice_id,
            task_id: existingTask.task_id,
            notes: existingTask.notes,
          });
          nextById.set(taskUnitId, blockedTask.item);
          if (blockedTask.changed) {
            updated.push(taskUnitId);
          }
        }
        continue;
      }

      for (const task of sliceValidation.tasks.sort((left, right) => left.unit_id.localeCompare(right.unit_id))) {
        const parsedTask = parseUnitId(task.unit_id);
        const taskMerged = mergeQueueItem(existingById.get(task.unit_id), {
          unit_id: task.unit_id,
          unit_type: "task",
          status: taskStatus(existingById.get(task.unit_id), true),
          depends_on: [...task.dependencies],
          milestone_id: parsedTask.milestone_id ?? undefined,
          slice_id: parsedTask.slice_id ?? undefined,
          task_id: parsedTask.task_id ?? undefined,
          notes: task.objective,
        });
        nextById.set(task.unit_id, taskMerged.item);
        if (taskMerged.changed) {
          (taskMerged.added ? added : updated).push(task.unit_id);
        }
        if (taskMerged.added) {
          appendedIds.push(task.unit_id);
        }
      }
    }
  }

  const orderedItems: QueueItem[] = [];
  const seen = new Set<string>();

  for (const item of queue.items) {
    const next = nextById.get(item.unit_id);
    if (!next || seen.has(item.unit_id)) {
      continue;
    }
    orderedItems.push(next);
    seen.add(item.unit_id);
  }

  for (const unitId of appendedIds) {
    const next = nextById.get(unitId);
    if (!next || seen.has(unitId)) {
      continue;
    }
    orderedItems.push(next);
    seen.add(unitId);
  }

  for (const [unitId, item] of [...nextById.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (seen.has(unitId)) {
      continue;
    }
    orderedItems.push(item);
    seen.add(unitId);
  }

  const nextQueue: QueueState = {
    ...queue,
    items: orderedItems,
  };
  validateQueueState(nextQueue);

  const changed = JSON.stringify(queue) !== JSON.stringify(nextQueue);
  if (changed) {
    writeJsonFile(resolveRepoPath(root, QUEUE_STATE_PATH), nextQueue);
  }

  return {
    changed,
    queue: nextQueue,
    added: unique(added),
    updated: unique(updated),
    validations,
  };
}

export function modernSliceRefs(root: string, milestoneId: string, sliceId: string): string[] {
  return refsForManagedSlice(root, milestoneId, sliceId);
}
