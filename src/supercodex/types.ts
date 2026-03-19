export const PHASES = [
  "intake",
  "clarify",
  "map",
  "research",
  "plan",
  "dispatch",
  "implement",
  "verify",
  "review",
  "integrate",
  "complete_task",
  "complete_slice",
  "reassess",
  "recover",
  "awaiting_human",
  "blocked",
  "complete",
] as const;

export type Phase = (typeof PHASES)[number];

export const QUEUE_STATUSES = ["ready", "active", "blocked", "ready_to_integrate", "done"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const UNIT_TYPES = [
  "milestone",
  "slice",
  "task",
  "discovery",
  "mapping",
  "research",
  "verification",
  "review",
  "integration",
  "summarization",
  "roadmap",
  "audit",
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export interface CurrentState {
  version: number;
  project_root: string;
  context_profile: "budget" | "balanced" | "quality";
  phase: Phase;
  active_runtime: string | null;
  active_milestone: string | null;
  active_slice: string | null;
  active_task: string | null;
  current_run_id: string | null;
  queue_head: string | null;
  blocked: boolean;
  awaiting_human: boolean;
  git: {
    trunk_branch: string;
    milestone_branch: string | null;
    task_branch: string | null;
    worktree_path: string | null;
    base_commit: string | null;
    head_commit: string | null;
    dirty: boolean;
  };
  last_transition_at: string | null;
  last_verified_commit: string | null;
  recovery_ref: string | null;
  metrics: {
    human_interventions: number;
    completed_tasks: number;
    failed_attempts: number;
    recovered_runs: number;
    recovery_mismatches: number;
    memory_audits: number;
    postmortems_generated: number;
    parallel_dispatches: number;
    integrated_tasks: number;
    integration_conflicts: number;
    learning_cycles: number;
    skill_health_refreshes: number;
    pattern_candidates_generated: number;
    roadmap_reassessments: number;
    process_reports_generated: number;
  };
}

export interface QueueItem {
  unit_id: string;
  unit_type: UnitType;
  status: QueueStatus;
  depends_on: string[];
  enqueued_at: string;
  milestone_id?: string;
  slice_id?: string;
  task_id?: string;
  notes?: string;
}

export interface QueueState {
  version: number;
  items: QueueItem[];
}

export interface LockRecord {
  resource: string;
  owner: string;
  scope: string;
  reason: string;
  lock_kind?: "resource" | "integration" | "workspace";
  worker_id?: string;
  unit_id?: string;
  run_id?: string;
  base_commit?: string | null;
  worktree_path?: string | null;
  acquired_at: string;
}

export interface TransitionRecord {
  timestamp: string;
  from_phase: Phase;
  to_phase: Phase;
  reason: string;
  actor: string;
  unit_id?: string;
  worker_id?: string;
  queue_head: string | null;
  blocked: boolean;
  awaiting_human: boolean;
}

export interface TemplateSyncResult {
  created: string[];
  replaced: string[];
  kept: string[];
}
