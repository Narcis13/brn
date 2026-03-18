import type { DispatchPacket, NormalizedResult, NormalizedStatus, RuntimeId, RuntimeRunHandle } from "../runtime/types.js";
import type { CurrentState, Phase } from "../types.js";

export const NEXT_ACTION_TYPES = ["dispatch", "retry", "resume", "escalate", "none"] as const;
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];

export interface NextActionDecision {
  version: number;
  action: NextActionType;
  unit_id: string | null;
  unit_type: string | null;
  phase: Phase;
  role: string | null;
  runtime: RuntimeId | null;
  rationale: string[];
  retry_count: number;
  selected_run_id: string | null;
  context_profile: CurrentState["context_profile"];
}

export interface ContextManifestLayers {
  system: string[];
  unit: string[];
  milestone: string[];
  supporting: string[];
  retry: string[];
}

export interface ContextManifest {
  version: number;
  unit_id: string;
  context_profile: CurrentState["context_profile"];
  layers: ContextManifestLayers;
  refs: string[];
}

export interface CanonicalRunGitSnapshot {
  trunk_branch: string;
  milestone_branch: string | null;
  task_branch: string | null;
  worktree_path: string | null;
  head_commit: string | null;
  dirty: boolean;
}

export interface CanonicalRunRecord {
  version: number;
  run_id: string;
  parent_run_id: string | null;
  unit_id: string;
  unit_type: string;
  action: Extract<NextActionType, "dispatch" | "retry" | "resume">;
  role: string;
  runtime: RuntimeId;
  status: NormalizedStatus | "running";
  summary: string;
  decision_ref: string;
  context_ref: string;
  packet_ref: string;
  prompt_ref: string;
  handle_ref: string | null;
  normalized_ref: string | null;
  raw_ref: string | null;
  continuation_ref: string;
  state_ref: string;
  started_at: string;
  completed_at: string | null;
  retry_count: number;
  git_before: CanonicalRunGitSnapshot;
  git_after: CanonicalRunGitSnapshot | null;
  blockers: string[];
  assumptions: string[];
  verification_evidence: string[];
  followups: string[];
}

export interface NextActionShowResult {
  decision: NextActionDecision;
  context_manifest: ContextManifest | null;
  packet: DispatchPacket | null;
  prompt_preview: string | null;
}

export interface NextActionDispatchResult extends NextActionShowResult {
  record: CanonicalRunRecord | null;
  handle: RuntimeRunHandle | null;
  result: NormalizedResult | null;
}
