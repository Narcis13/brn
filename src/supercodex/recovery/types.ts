import type { RuntimeId, NormalizedStatus } from "../runtime/types.js";
import type { CanonicalRunGitSnapshot } from "../synth/types.js";
import type { Phase } from "../types.js";

export const RECOVERY_CHECKPOINT_KINDS = ["pre_dispatch", "post_result", "pre_reconcile"] as const;
export type RecoveryCheckpointKind = (typeof RECOVERY_CHECKPOINT_KINDS)[number];

export const RECOVERY_DRIFT_SEVERITIES = ["warning", "blocking"] as const;
export type RecoveryDriftSeverity = (typeof RECOVERY_DRIFT_SEVERITIES)[number];

export const RECOVERY_RECOMMENDATIONS = [
  "resume",
  "dispatch",
  "retry",
  "replan",
  "await_human",
  "restart",
  "none",
] as const;
export type RecoveryRecommendation = (typeof RECOVERY_RECOMMENDATIONS)[number];

export interface RecoveryDrift {
  code: string;
  severity: RecoveryDriftSeverity;
  message: string;
  ref: string | null;
}

export interface RecoveryCheckpoint {
  version: number;
  run_id: string;
  kind: RecoveryCheckpointKind;
  unit_id: string | null;
  phase: Phase;
  runtime: RuntimeId | null;
  state_ref: string;
  continuation_ref: string;
  git: CanonicalRunGitSnapshot;
  summary: string;
  created_at: string;
}

export interface ContinuationPacket {
  version: number;
  run_id: string;
  unit_id: string;
  action: string;
  runtime: RuntimeId | null;
  status: NormalizedStatus | "pending";
  objective: string;
  completed: string[];
  remaining: string[];
  best_hypothesis: string;
  first_next_step: string;
  files_in_play: string[];
  known_pitfalls: string[];
  generated_at: string;
}

export interface RecoveryAssessment {
  version: number;
  run_id: string;
  unit_id: string | null;
  current_phase: Phase;
  latest_status: NormalizedStatus | "running";
  recommendation: RecoveryRecommendation;
  can_resume: boolean;
  summary: string;
  drifts: RecoveryDrift[];
  refs: string[];
  generated_at: string;
}
