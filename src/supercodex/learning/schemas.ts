import Ajv2020Module from "ajv/dist/2020.js";

import type {
  LearningState,
  PatternCandidate,
  ProcessImprovementReport,
  RoadmapReassessmentReport,
  SkillHealthSnapshot,
} from "./types.js";
import {
  PATTERN_CANDIDATE_KINDS,
  PATTERN_CANDIDATE_STATUSES,
  PROCESS_IMPROVEMENT_CATEGORIES,
  PROCESS_IMPROVEMENT_PRIORITIES,
  ROADMAP_RECOMMENDATION_ACTIONS,
} from "./types.js";

type Schema = Record<string, unknown>;

const usageSchema: Schema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["input_tokens", "output_tokens", "total_tokens"],
      properties: {
        input_tokens: { type: ["integer", "null"], minimum: 0 },
        output_tokens: { type: ["integer", "null"], minimum: 0 },
        total_tokens: { type: ["integer", "null"], minimum: 0 },
      },
    },
    { type: "null" },
  ],
};

const learningStateSchema: Schema = {
  $id: "learning-state.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "processed_slice_unit_ids",
    "processed_postmortem_run_ids",
    "latest_skill_health_ref",
    "latest_roadmap_report_ref",
    "latest_process_report_ref",
    "latest_pattern_candidate_refs",
    "pending_pattern_candidates",
    "last_error",
    "updated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    processed_slice_unit_ids: { type: "array", items: { type: "string", minLength: 1 } },
    processed_postmortem_run_ids: { type: "array", items: { type: "string", minLength: 1 } },
    latest_skill_health_ref: { type: ["string", "null"] },
    latest_roadmap_report_ref: { type: ["string", "null"] },
    latest_process_report_ref: { type: ["string", "null"] },
    latest_pattern_candidate_refs: { type: "array", items: { type: "string", minLength: 1 } },
    pending_pattern_candidates: { type: "integer", minimum: 0 },
    last_error: { type: ["string", "null"] },
    updated_at: { type: ["string", "null"] },
  },
};

const skillHealthEntrySchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "skill_id",
    "skill_ref",
    "usage_count",
    "success_rate",
    "helpful_rate",
    "failure_rate",
    "average_total_tokens",
    "last_used_at",
    "stale",
    "correlated_with_failures",
  ],
  properties: {
    skill_id: { type: "string", minLength: 1 },
    skill_ref: { type: "string", minLength: 1 },
    usage_count: { type: "integer", minimum: 0 },
    success_rate: { type: "number", minimum: 0, maximum: 1 },
    helpful_rate: { type: "number", minimum: 0, maximum: 1 },
    failure_rate: { type: "number", minimum: 0, maximum: 1 },
    average_total_tokens: { type: ["number", "null"], minimum: 0 },
    last_used_at: { type: ["string", "null"] },
    stale: { type: "boolean" },
    correlated_with_failures: { type: "boolean" },
  },
};

const skillHealthSnapshotSchema: Schema = {
  $id: "skill-health.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "generated_at", "generated_from_runs", "skills"],
  properties: {
    version: { type: "integer", minimum: 1 },
    generated_at: { type: "string", minLength: 1 },
    generated_from_runs: { type: "integer", minimum: 0 },
    skills: {
      type: "array",
      items: skillHealthEntrySchema,
    },
  },
};

const patternCandidateSchema: Schema = {
  $id: "pattern-candidate.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "candidate_id", "source_unit_id", "kind", "status", "summary", "rationale", "evidence_refs", "generated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    candidate_id: { type: "string", minLength: 1 },
    source_unit_id: { type: "string", minLength: 1 },
    kind: { enum: [...PATTERN_CANDIDATE_KINDS] },
    status: { enum: [...PATTERN_CANDIDATE_STATUSES] },
    summary: { type: "string", minLength: 1 },
    rationale: { type: "string", minLength: 1 },
    evidence_refs: { type: "array", items: { type: "string", minLength: 1 } },
    generated_at: { type: "string", minLength: 1 },
  },
};

const roadmapRecommendationSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "target_unit_id", "rationale", "evidence_refs"],
  properties: {
    action: { enum: [...ROADMAP_RECOMMENDATION_ACTIONS] },
    target_unit_id: { type: ["string", "null"] },
    rationale: { type: "string", minLength: 1 },
    evidence_refs: { type: "array", items: { type: "string", minLength: 1 } },
  },
};

const roadmapReassessmentSchema: Schema = {
  $id: "roadmap-reassessment.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "unit_id", "summary", "recommendations", "evidence_refs", "generated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    recommendations: { type: "array", items: roadmapRecommendationSchema },
    evidence_refs: { type: "array", items: { type: "string", minLength: 1 } },
    generated_at: { type: "string", minLength: 1 },
  },
};

const processImprovementRecommendationSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "priority", "action", "rationale", "evidence_refs"],
  properties: {
    category: { enum: [...PROCESS_IMPROVEMENT_CATEGORIES] },
    priority: { enum: [...PROCESS_IMPROVEMENT_PRIORITIES] },
    action: { type: "string", minLength: 1 },
    rationale: { type: "string", minLength: 1 },
    evidence_refs: { type: "array", items: { type: "string", minLength: 1 } },
  },
};

const processImprovementSchema: Schema = {
  $id: "process-improvement.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "run_id", "unit_id", "trigger", "summary", "usage", "recommendations", "evidence_refs", "generated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    unit_id: { type: ["string", "null"] },
    trigger: { const: "postmortem" },
    summary: { type: "string", minLength: 1 },
    usage: usageSchema,
    recommendations: { type: "array", items: processImprovementRecommendationSchema },
    evidence_refs: { type: "array", items: { type: "string", minLength: 1 } },
    generated_at: { type: "string", minLength: 1 },
  },
};

export const learningSchemaFileEntries = [
  ["learning-state.schema.json", learningStateSchema],
  ["skill-health.schema.json", skillHealthSnapshotSchema],
  ["pattern-candidate.schema.json", patternCandidateSchema],
  ["roadmap-reassessment.schema.json", roadmapReassessmentSchema],
  ["process-improvement.schema.json", processImprovementSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  learningState: ajv.compile<LearningState>(learningStateSchema),
  skillHealth: ajv.compile<SkillHealthSnapshot>(skillHealthSnapshotSchema),
  patternCandidate: ajv.compile<PatternCandidate>(patternCandidateSchema),
  roadmapReassessment: ajv.compile<RoadmapReassessmentReport>(roadmapReassessmentSchema),
  processImprovement: ajv.compile<ProcessImprovementReport>(processImprovementSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.learningState.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateLearningState(value: unknown): asserts value is LearningState {
  if (!validators.learningState(value)) {
    throw new Error(formatErrors("learning state", validators.learningState.errors));
  }
}

export function validateSkillHealthSnapshot(value: unknown): asserts value is SkillHealthSnapshot {
  if (!validators.skillHealth(value)) {
    throw new Error(formatErrors("skill health snapshot", validators.skillHealth.errors));
  }
}

export function validatePatternCandidate(value: unknown): asserts value is PatternCandidate {
  if (!validators.patternCandidate(value)) {
    throw new Error(formatErrors("pattern candidate", validators.patternCandidate.errors));
  }
}

export function validateRoadmapReassessmentReport(value: unknown): asserts value is RoadmapReassessmentReport {
  if (!validators.roadmapReassessment(value)) {
    throw new Error(formatErrors("roadmap reassessment report", validators.roadmapReassessment.errors));
  }
}

export function validateProcessImprovementReport(value: unknown): asserts value is ProcessImprovementReport {
  if (!validators.processImprovement(value)) {
    throw new Error(formatErrors("process improvement report", validators.processImprovement.errors));
  }
}
