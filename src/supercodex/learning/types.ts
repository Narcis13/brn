import type { RuntimeUsage } from "../runtime/types.js";

export const PATTERN_CANDIDATE_KINDS = [
  "pattern_note",
  "verification_checklist",
  "skill_candidate",
  "template_candidate",
] as const;
export type PatternCandidateKind = (typeof PATTERN_CANDIDATE_KINDS)[number];

export const PATTERN_CANDIDATE_STATUSES = ["pending"] as const;
export type PatternCandidateStatus = (typeof PATTERN_CANDIDATE_STATUSES)[number];

export const ROADMAP_RECOMMENDATION_ACTIONS = ["keep", "reorder", "add_prerequisite", "split", "archive"] as const;
export type RoadmapRecommendationAction = (typeof ROADMAP_RECOMMENDATION_ACTIONS)[number];

export const PROCESS_IMPROVEMENT_CATEGORIES = ["docs", "skills", "policies", "tests_checks"] as const;
export type ProcessImprovementCategory = (typeof PROCESS_IMPROVEMENT_CATEGORIES)[number];

export const PROCESS_IMPROVEMENT_PRIORITIES = ["high", "medium", "low"] as const;
export type ProcessImprovementPriority = (typeof PROCESS_IMPROVEMENT_PRIORITIES)[number];

export interface LearningState {
  version: number;
  processed_slice_unit_ids: string[];
  processed_postmortem_run_ids: string[];
  latest_skill_health_ref: string | null;
  latest_roadmap_report_ref: string | null;
  latest_process_report_ref: string | null;
  latest_pattern_candidate_refs: string[];
  pending_pattern_candidates: number;
  last_error: string | null;
  updated_at: string | null;
}

export interface SkillHealthEntry {
  skill_id: string;
  skill_ref: string;
  usage_count: number;
  success_rate: number;
  helpful_rate: number;
  failure_rate: number;
  average_total_tokens: number | null;
  last_used_at: string | null;
  stale: boolean;
  correlated_with_failures: boolean;
}

export interface SkillHealthSnapshot {
  version: number;
  generated_at: string;
  generated_from_runs: number;
  skills: SkillHealthEntry[];
}

export interface PatternCandidate {
  version: number;
  candidate_id: string;
  source_unit_id: string;
  kind: PatternCandidateKind;
  status: PatternCandidateStatus;
  summary: string;
  rationale: string;
  evidence_refs: string[];
  generated_at: string;
}

export interface RoadmapRecommendation {
  action: RoadmapRecommendationAction;
  target_unit_id: string | null;
  rationale: string;
  evidence_refs: string[];
}

export interface RoadmapReassessmentReport {
  version: number;
  unit_id: string;
  summary: string;
  recommendations: RoadmapRecommendation[];
  evidence_refs: string[];
  generated_at: string;
}

export interface ProcessImprovementRecommendation {
  category: ProcessImprovementCategory;
  priority: ProcessImprovementPriority;
  action: string;
  rationale: string;
  evidence_refs: string[];
}

export interface ProcessImprovementReport {
  version: number;
  run_id: string;
  unit_id: string | null;
  trigger: "postmortem";
  summary: string;
  usage: RuntimeUsage | null;
  recommendations: ProcessImprovementRecommendation[];
  evidence_refs: string[];
  generated_at: string;
}
