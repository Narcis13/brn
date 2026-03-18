import type { TaskTddMode, VerificationPlanBuckets } from "../planning/types.js";

export const VERIFICATION_VERDICTS = ["pass", "fail", "blocked"] as const;
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

export const REVIEW_VERDICTS = ["green", "changes_requested", "blocked"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface VerificationReport {
  version: number;
  unit_id: string;
  implementation_run_id: string;
  verification_run_id: string;
  tdd_mode: TaskTddMode;
  tdd_justification: string | null;
  required_reviewers: string[];
  ladder: VerificationPlanBuckets;
  tests_written: string[];
  tests_run: string[];
  evidence: string[];
  summary: string;
  findings: string[];
  followups: string[];
  verdict: VerificationVerdict;
  generated_at: string;
}

export interface ReviewReport {
  version: number;
  unit_id: string;
  persona: string;
  verification_run_id: string;
  review_run_id: string;
  summary: string;
  findings: string[];
  followups: string[];
  verdict: ReviewVerdict;
  generated_at: string;
}

export interface CompletionRecord {
  version: number;
  unit_id: string;
  implementation_run_id: string;
  verification_run_id: string;
  review_run_ids: Record<string, string>;
  summary: string;
  completed_at: string;
}

export interface TaskVerificationState {
  unit_id: string;
  implementation_run_id: string | null;
  verification: VerificationReport | null;
  reviews: ReviewReport[];
  completion: CompletionRecord | null;
  required_reviewers: string[];
  pending_reviewers: string[];
  next_reviewer: string | null;
  status: "implement" | "verify" | "review" | "complete";
}
