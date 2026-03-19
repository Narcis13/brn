import { fileExists, listFiles, readJsonFile, readTextIfExists, writeJsonFile } from "../fs.js";
import type { PostmortemReport } from "../audit/types.js";
import {
  LEARNING_PATTERNS_DIR,
  LEARNING_PROCESS_DIR,
  LEARNING_ROADMAP_DIR,
  LEARNING_SKILLS_DIR,
  LEARNING_STATE_PATH,
  resolveRepoPath,
} from "../paths.js";
import { listTaskIds, loadTaskArtifact, parseUnitId } from "../planning/index.js";
import type { RuntimeUsage, SkillUsageRecord } from "../runtime/types.js";
import { loadCurrentState, saveCurrentState } from "../state.js";
import { loadCanonicalRunRecord, listCanonicalRunRecords, listCanonicalRunRecordsForUnit } from "../synth/runs.js";
import { getTaskVerificationPaths, getTaskVerificationState, reviewReportRef } from "../verify/index.js";
import {
  validateLearningState,
  validatePatternCandidate,
  validateProcessImprovementReport,
  validateRoadmapReassessmentReport,
  validateSkillHealthSnapshot,
} from "./schemas.js";
import type {
  LearningState,
  PatternCandidate,
  ProcessImprovementReport,
  RoadmapRecommendation,
  RoadmapReassessmentReport,
  SkillHealthSnapshot,
} from "./types.js";

const SKILL_HEALTH_REF = `${LEARNING_SKILLS_DIR}/health.json`;

function slugify(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function defaultLearningState(): LearningState {
  return {
    version: 1,
    processed_slice_unit_ids: [],
    processed_postmortem_run_ids: [],
    latest_skill_health_ref: null,
    latest_roadmap_report_ref: null,
    latest_process_report_ref: null,
    latest_pattern_candidate_refs: [],
    pending_pattern_candidates: 0,
    last_error: null,
    updated_at: null,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function patternCandidateRef(candidateId: string): string {
  return `${LEARNING_PATTERNS_DIR}/${candidateId}.json`;
}

function roadmapReportRef(unitId: string): string {
  return `${LEARNING_ROADMAP_DIR}/${slugify(unitId)}.json`;
}

function processReportRef(runId: string): string {
  return `${LEARNING_PROCESS_DIR}/${runId}.json`;
}

function memoryAuditRef(unitId: string): string {
  return `.supercodex/audits/memory/${slugify(unitId)}.json`;
}

function postmortemRef(runId: string): string {
  return `.supercodex/audits/postmortems/${runId}.json`;
}

function discoverProjectSkills(root: string): Array<{ skill_id: string; skill_ref: string }> {
  const skillsRoot = resolveRepoPath(root, "skills");
  return listFiles(skillsRoot)
    .map((name) => ({ skill_id: name, skill_ref: `skills/${name}/SKILL.md` }))
    .filter((entry) => fileExists(resolveRepoPath(root, entry.skill_ref)));
}

function appendMetric(
  root: string,
  field:
    | "learning_cycles"
    | "skill_health_refreshes"
    | "pattern_candidates_generated"
    | "roadmap_reassessments"
    | "process_reports_generated",
  amount = 1,
): void {
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

function saveLearningState(root: string, value: LearningState): LearningState {
  const next = {
    ...value,
    processed_slice_unit_ids: unique(value.processed_slice_unit_ids),
    processed_postmortem_run_ids: unique(value.processed_postmortem_run_ids),
    latest_pattern_candidate_refs: unique(value.latest_pattern_candidate_refs),
  };
  validateLearningState(next);
  writeJsonFile(resolveRepoPath(root, LEARNING_STATE_PATH), next);
  return next;
}

export function loadLearningState(root: string): LearningState {
  const path = resolveRepoPath(root, LEARNING_STATE_PATH);
  if (!fileExists(path)) {
    return defaultLearningState();
  }

  const raw = readJsonFile<LearningState>(path);
  const normalized: LearningState = {
    ...defaultLearningState(),
    ...raw,
    processed_slice_unit_ids: unique(raw.processed_slice_unit_ids ?? []),
    processed_postmortem_run_ids: unique(raw.processed_postmortem_run_ids ?? []),
    latest_pattern_candidate_refs: unique(raw.latest_pattern_candidate_refs ?? []),
    pending_pattern_candidates: raw.pending_pattern_candidates ?? 0,
    last_error: raw.last_error ?? null,
    updated_at: raw.updated_at ?? null,
  };
  validateLearningState(normalized);
  return normalized;
}

export function recordLearningError(root: string, message: string): LearningState {
  const state = loadLearningState(root);
  return saveLearningState(root, {
    ...state,
    last_error: message.trim() || "Unknown learning error.",
    updated_at: nowIso(),
  });
}

function clearLearningError(root: string): void {
  const state = loadLearningState(root);
  if (state.last_error === null) {
    return;
  }

  saveLearningState(root, {
    ...state,
    last_error: null,
    updated_at: nowIso(),
  });
}

export function listPatternCandidates(root: string): PatternCandidate[] {
  const dir = resolveRepoPath(root, LEARNING_PATTERNS_DIR);
  return listFiles(dir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const candidate = readJsonFile<PatternCandidate>(resolveRepoPath(root, `${LEARNING_PATTERNS_DIR}/${fileName}`));
      validatePatternCandidate(candidate);
      return candidate;
    })
    .sort((left, right) => left.generated_at.localeCompare(right.generated_at));
}

function loadSkillHealthSnapshot(root: string): SkillHealthSnapshot | null {
  const path = resolveRepoPath(root, SKILL_HEALTH_REF);
  if (!fileExists(path)) {
    return null;
  }

  const snapshot = readJsonFile<SkillHealthSnapshot>(path);
  validateSkillHealthSnapshot(snapshot);
  return snapshot;
}

function loadRoadmapReport(root: string, ref: string | null): RoadmapReassessmentReport | null {
  if (!ref || !fileExists(resolveRepoPath(root, ref))) {
    return null;
  }

  const report = readJsonFile<RoadmapReassessmentReport>(resolveRepoPath(root, ref));
  validateRoadmapReassessmentReport(report);
  return report;
}

function loadProcessReport(root: string, ref: string | null): ProcessImprovementReport | null {
  if (!ref || !fileExists(resolveRepoPath(root, ref))) {
    return null;
  }

  const report = readJsonFile<ProcessImprovementReport>(resolveRepoPath(root, ref));
  validateProcessImprovementReport(report);
  return report;
}

export function showLearning(root: string): {
  state: LearningState;
  skill_health: SkillHealthSnapshot | null;
  latest_roadmap_report: RoadmapReassessmentReport | null;
  latest_process_report: ProcessImprovementReport | null;
  patterns: PatternCandidate[];
} {
  const state = loadLearningState(root);
  return {
    state,
    skill_health: loadSkillHealthSnapshot(root),
    latest_roadmap_report: loadRoadmapReport(root, state.latest_roadmap_report_ref),
    latest_process_report: loadProcessReport(root, state.latest_process_report_ref),
    patterns: listPatternCandidates(root),
  };
}

function relatedSlicePostmortemRefs(root: string, unitId: string): string[] {
  const runs = listCanonicalRunRecords(root).filter((record) => record.unit_id.startsWith(`${unitId}/`));
  return unique(
    runs
      .map((record) => postmortemRef(record.run_id))
      .filter((ref) => fileExists(resolveRepoPath(root, ref))),
  );
}

function saveSkillHealthSnapshot(root: string): { snapshot: SkillHealthSnapshot; created: boolean } {
  const skills = discoverProjectSkills(root);
  const skillMap = new Map(
    skills.map((skill) => [
      skill.skill_id,
      {
        ...skill,
        usage_count: 0,
        success_count: 0,
        helpful_count: 0,
        failure_count: 0,
        token_total: 0,
        token_samples: 0,
        last_used_at: null as string | null,
      },
    ]),
  );

  const runs = listCanonicalRunRecords(root);
  for (const record of runs) {
    for (const skill of record.skills_used ?? []) {
      const aggregate = skillMap.get(skill.skill_id);
      if (!aggregate) {
        continue;
      }

      aggregate.usage_count += 1;
      aggregate.success_count += record.status === "success" ? 1 : 0;
      aggregate.helpful_count += skill.outcome === "helpful" ? 1 : 0;
      aggregate.failure_count += skill.outcome === "failed" || record.status === "failed" ? 1 : 0;
      if (record.usage?.total_tokens !== null && record.usage?.total_tokens !== undefined) {
        aggregate.token_total += record.usage.total_tokens;
        aggregate.token_samples += 1;
      }
      const usedAt = record.completed_at ?? record.started_at;
      if (!aggregate.last_used_at || usedAt > aggregate.last_used_at) {
        aggregate.last_used_at = usedAt;
      }
    }
  }

  const snapshot: SkillHealthSnapshot = {
    version: 1,
    generated_at: nowIso(),
    generated_from_runs: runs.length,
    skills: [...skillMap.values()]
      .map((entry) => ({
        skill_id: entry.skill_id,
        skill_ref: entry.skill_ref,
        usage_count: entry.usage_count,
        success_rate: entry.usage_count === 0 ? 0 : roundRate(entry.success_count / entry.usage_count),
        helpful_rate: entry.usage_count === 0 ? 0 : roundRate(entry.helpful_count / entry.usage_count),
        failure_rate: entry.usage_count === 0 ? 0 : roundRate(entry.failure_count / entry.usage_count),
        average_total_tokens: entry.token_samples === 0 ? null : roundRate(entry.token_total / entry.token_samples),
        last_used_at: entry.last_used_at,
        stale: entry.usage_count === 0,
        correlated_with_failures: entry.usage_count >= 2 && entry.failure_count / entry.usage_count >= 0.5,
      }))
      .sort((left, right) => left.skill_id.localeCompare(right.skill_id)),
  };

  validateSkillHealthSnapshot(snapshot);
  const ref = SKILL_HEALTH_REF;
  const created = !fileExists(resolveRepoPath(root, ref));
  writeJsonFile(resolveRepoPath(root, ref), snapshot);

  const state = loadLearningState(root);
  saveLearningState(root, {
    ...state,
    latest_skill_health_ref: ref,
    updated_at: nowIso(),
  });
  clearLearningError(root);
  appendMetric(root, "skill_health_refreshes", 1);
  return { snapshot, created };
}

function createPatternCandidates(root: string, unitId: string): { refs: string[]; created: number } {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "slice" || !parsed.milestone_id || !parsed.slice_id) {
    throw new Error(`Pattern extraction requires a slice unit id, received ${unitId}.`);
  }

  const refs: string[] = [];
  let created = 0;

  for (const taskId of listTaskIds(root, parsed.milestone_id, parsed.slice_id)) {
    const taskUnitId = `${parsed.milestone_id}/${parsed.slice_id}/${taskId}`;
    const task = loadTaskArtifact(root, parsed.milestone_id, parsed.slice_id, taskId);
    const verificationState = getTaskVerificationState(root, taskUnitId);
    const taskRuns = listCanonicalRunRecordsForUnit(root, taskUnitId);
    const implementationRuns = taskRuns.filter((record) => record.role === "implementer");
    const failedRuns = implementationRuns.filter((record) => record.status === "failed").length;
    const retries = Math.max(0, implementationRuns.length - 1);
    const reviewVerdicts = verificationState.reviews.map((review) => review.verdict);
    const taskAuditPath = resolveRepoPath(root, memoryAuditRef(taskUnitId));
    const taskAudit = fileExists(taskAuditPath)
      ? (readJsonFile(taskAuditPath) as { verdict?: string })
      : null;
    const hasPostmortem = taskRuns.some((record) => fileExists(resolveRepoPath(root, postmortemRef(record.run_id))));
    const reviewsGreen = reviewVerdicts.length > 0 && reviewVerdicts.every((verdict) => verdict === "green");

    if (!verificationState.completion || verificationState.verification?.verdict !== "pass" || !reviewsGreen) {
      continue;
    }
    if (failedRuns > 0 || retries > 1 || hasPostmortem || taskAudit?.verdict === "fail") {
      continue;
    }

    const candidateId = `${slugify(taskUnitId)}-pattern-note`;
    const ref = patternCandidateRef(candidateId);
    const candidate: PatternCandidate = {
      version: 1,
      candidate_id: candidateId,
      source_unit_id: taskUnitId,
      kind: "pattern_note",
      status: "pending",
      summary: `Reusable implementation and verification pattern for ${task.objective}.`,
      rationale: `Task ${taskUnitId} completed with passing verification, green reviewer passes, no related postmortem, and no blocking audit findings.`,
      evidence_refs: unique([
        `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/tasks/${taskId}.md`,
        getTaskVerificationPaths(taskUnitId).verification_ref,
        getTaskVerificationPaths(taskUnitId).completion_ref,
        ...verificationState.reviews.map((review) => reviewReportRef(taskUnitId, review.persona)),
      ]),
      generated_at: nowIso(),
    };
    validatePatternCandidate(candidate);
    const isNew = !fileExists(resolveRepoPath(root, ref));
    writeJsonFile(resolveRepoPath(root, ref), candidate);
    refs.push(ref);
    if (isNew) {
      created += 1;
    }
  }

  return { refs, created };
}

function createRoadmapReport(root: string, unitId: string): { ref: string; created: boolean; report: RoadmapReassessmentReport } {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "slice" || !parsed.milestone_id || !parsed.slice_id) {
    throw new Error(`Roadmap reassessment requires a slice unit id, received ${unitId}.`);
  }

  const taskIds = listTaskIds(root, parsed.milestone_id, parsed.slice_id);
  const postmortemRefs = relatedSlicePostmortemRefs(root, unitId);
  const evidenceRefs = unique([
    "vault/roadmap.md",
    `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/summary.md`,
    memoryAuditRef(unitId),
    ...postmortemRefs,
  ].filter((ref) => fileExists(resolveRepoPath(root, ref))));

  const recommendations: RoadmapRecommendation[] = [];
  if (postmortemRefs.length > 0) {
    recommendations.push({
      action: "add_prerequisite",
      target_unit_id: unitId,
      rationale: `Slice ${unitId} generated ${postmortemRefs.length} postmortem signal${postmortemRefs.length === 1 ? "" : "s"} and should add an explicit prerequisite before similar work continues.`,
      evidence_refs: [...postmortemRefs],
    });
  }
  if (taskIds.length >= 4) {
    recommendations.push({
      action: "split",
      target_unit_id: unitId,
      rationale: `Slice ${unitId} contains ${taskIds.length} tasks and is large enough to justify a split recommendation.`,
      evidence_refs: evidenceRefs,
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      action: "keep",
      target_unit_id: unitId,
      rationale: `Slice ${unitId} completed without strong signals that require roadmap reordering or new prerequisites.`,
      evidence_refs: evidenceRefs,
    });
  }

  const report: RoadmapReassessmentReport = {
    version: 1,
    unit_id: unitId,
    summary: `Roadmap reassessment generated for ${unitId}.`,
    recommendations,
    evidence_refs: evidenceRefs,
    generated_at: nowIso(),
  };
  validateRoadmapReassessmentReport(report);

  const ref = roadmapReportRef(unitId);
  const created = !fileExists(resolveRepoPath(root, ref));
  writeJsonFile(resolveRepoPath(root, ref), report);
  return { ref, created, report };
}

export function createProcessImprovementReport(root: string, runId: string): ProcessImprovementReport {
  const reportPath = resolveRepoPath(root, processReportRef(runId));
  if (fileExists(reportPath)) {
    const existing = readJsonFile<ProcessImprovementReport>(reportPath);
    validateProcessImprovementReport(existing);
    return existing;
  }

  const state = loadLearningState(root);
  const record = loadCanonicalRunRecord(root, runId);
  const postmortemPath = resolveRepoPath(root, postmortemRef(runId));
  if (!fileExists(postmortemPath)) {
    throw new Error(`Postmortem is required before creating a process improvement report for ${runId}.`);
  }

  const postmortem = readJsonFile<PostmortemReport>(postmortemPath);
  const evidenceRefs = unique([postmortemRef(runId), ...postmortem.evidence_refs]);
  const recommendations = [
    {
      category: "docs" as const,
      priority: "high" as const,
      action: `Update local docs and task framing notes to capture the ${postmortem.trigger} failure mode before the next attempt.`,
      rationale: `Postmortem ${runId} recorded a process failure that should be made explicit in durable docs first.`,
      evidence_refs: evidenceRefs,
    },
    {
      category: "policies" as const,
      priority: postmortem.trigger === "retry_exhausted" ? ("high" as const) : ("medium" as const),
      action: "Review retry budgets, task sizing, and recovery thresholds for similar units.",
      rationale: `Run ${runId} ended with trigger ${postmortem.trigger}, which indicates a policy or decomposition weakness.`,
      evidence_refs: evidenceRefs,
    },
    {
      category: "tests_checks" as const,
      priority: "medium" as const,
      action: "Add or tighten verification checks so the same failure mode is caught earlier.",
      rationale: `The postmortem and canonical run evidence should become a deterministic regression check.`,
      evidence_refs: evidenceRefs,
    },
    ...unique((record.skills_used ?? []).filter((skill) => skill.outcome === "failed").map((skill) => skill.skill_id)).map((skillId) => ({
      category: "skills" as const,
      priority: "high" as const,
      action: `Review project skill ${skillId} before it is used again on similar work.`,
      rationale: `Runtime self-report marked ${skillId} as failed during ${runId}.`,
      evidence_refs: evidenceRefs,
    })),
  ];

  const report: ProcessImprovementReport = {
    version: 1,
    run_id: runId,
    unit_id: record.unit_id,
    trigger: "postmortem",
    summary: `Process improvement report generated for ${runId}.`,
    usage: record.usage ?? null,
    recommendations,
    evidence_refs: evidenceRefs,
    generated_at: nowIso(),
  };
  validateProcessImprovementReport(report);
  const ref = processReportRef(runId);
  writeJsonFile(resolveRepoPath(root, ref), report);

  saveLearningState(root, {
    ...state,
    processed_postmortem_run_ids: [...state.processed_postmortem_run_ids, runId],
    latest_process_report_ref: ref,
    updated_at: nowIso(),
  });
  clearLearningError(root);
  appendMetric(root, "process_reports_generated", 1);
  return report;
}

export function runLearningCycle(root: string, unitId: string): {
  state: LearningState;
  skill_health: SkillHealthSnapshot;
  roadmap_report: RoadmapReassessmentReport;
  pattern_candidates: PatternCandidate[];
} {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "slice") {
    throw new Error(`Learning cycles require a slice unit id, received ${unitId}.`);
  }

  const existingState = loadLearningState(root);
  if (existingState.processed_slice_unit_ids.includes(unitId)) {
    return {
      state: existingState,
      skill_health: loadSkillHealthSnapshot(root) ?? saveSkillHealthSnapshot(root).snapshot,
      roadmap_report:
        loadRoadmapReport(root, roadmapReportRef(unitId)) ??
        createRoadmapReport(root, unitId).report,
      pattern_candidates: listPatternCandidates(root).filter((candidate) => candidate.source_unit_id.startsWith(`${unitId}/`)),
    };
  }

  const { snapshot } = saveSkillHealthSnapshot(root);
  const stateAfterSkillRefresh = loadLearningState(root);
  const patternResult = createPatternCandidates(root, unitId);
  const roadmap = createRoadmapReport(root, unitId);
  const candidates = patternResult.refs.map((ref) => {
    const candidate = readJsonFile<PatternCandidate>(resolveRepoPath(root, ref));
    validatePatternCandidate(candidate);
    return candidate;
  });

  const nextState = saveLearningState(root, {
    ...stateAfterSkillRefresh,
    processed_slice_unit_ids: [...stateAfterSkillRefresh.processed_slice_unit_ids, unitId],
    latest_roadmap_report_ref: roadmap.ref,
    latest_pattern_candidate_refs: patternResult.refs,
    pending_pattern_candidates: listPatternCandidates(root).length,
    last_error: null,
    updated_at: nowIso(),
  });

  appendMetric(root, "learning_cycles", 1);
  appendMetric(root, "roadmap_reassessments", 1);
  appendMetric(root, "pattern_candidates_generated", patternResult.created);

  return {
    state: nextState,
    skill_health: snapshot,
    roadmap_report: roadmap.report,
    pattern_candidates: candidates,
  };
}
