import type { QueueItem, QueueState, QueueStatus, UnitType } from "../types.js";

export const TASK_TDD_MODES = ["strict_tdd", "brownfield_tdd", "verification_first"] as const;
export type TaskTddMode = (typeof TASK_TDD_MODES)[number];

export const VERIFICATION_LADDER_BUCKETS = [
  "static",
  "focused_tests",
  "behavioral",
  "slice_regression",
  "milestone_regression",
  "human_uat",
] as const;
export type VerificationLadderBucket = (typeof VERIFICATION_LADDER_BUCKETS)[number];

export interface VerificationPlanBuckets {
  static: string[];
  focused_tests: string[];
  behavioral: string[];
  slice_regression: string[];
  milestone_regression: string[];
  human_uat: string[];
}

export type PlanningUnitKind = "roadmap" | "milestone" | "slice" | "task" | "unknown";
export type PlanningMode = "legacy" | "modern";

export interface ParsedUnitId {
  raw: string;
  kind: PlanningUnitKind;
  milestone_id: string | null;
  slice_id: string | null;
  task_id: string | null;
}

export interface ParsedTaskArtifact {
  unit_id: string;
  objective: string;
  why_now: string;
  acceptance_criteria: string[];
  tdd_mode: TaskTddMode;
  tdd_justification: string | null;
  likely_files: string[];
  verification_plan: string[];
  verification_ladder: VerificationPlanBuckets;
  reviewer_passes: string[];
  dependencies: string[];
  safety_class: string;
  status: string;
  summary: string;
}

export interface PlanningValidationResult {
  unit_id: string;
  unit_type: UnitType;
  mode: PlanningMode;
  ok: boolean;
  issues: string[];
  refs: string[];
  tasks: ParsedTaskArtifact[];
}

export interface PlanningQueueSyncResult {
  changed: boolean;
  queue: QueueState;
  added: string[];
  updated: string[];
  validations: PlanningValidationResult[];
}

export interface QueueItemDraft {
  unit_id: string;
  unit_type: UnitType;
  status: QueueStatus;
  depends_on: string[];
  milestone_id?: string;
  slice_id?: string;
  task_id?: string;
  notes?: string;
}

export interface QueueMergeResult {
  item: QueueItem;
  changed: boolean;
  added: boolean;
}
