import type { QueueStatus } from "../types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { Phase } from "../types.js";

export const WORKER_PHASES = ["implement", "verify", "review", "recover", "blocked", "ready_to_integrate"] as const;
export type WorkerPhase = (typeof WORKER_PHASES)[number];

export const WORKER_STATUSES = ["active", "blocked", "ready_to_integrate"] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export interface WorkerState {
  version: number;
  worker_id: string;
  unit_id: string;
  phase: WorkerPhase;
  status: WorkerStatus;
  milestone_id: string;
  slice_id: string;
  task_id: string;
  runtime: RuntimeId;
  role: string;
  reviewer_pass: string | null;
  milestone_branch: string;
  task_branch: string;
  worktree_path: string;
  base_commit: string;
  current_run_id: string | null;
  last_run_id: string | null;
  canonical_commit: string | null;
  queue_status: Extract<QueueStatus, "active" | "blocked" | "ready_to_integrate">;
  owned_resources: string[];
  assigned_at: string;
  updated_at: string;
}

export interface ParallelState {
  version: number;
  max_workers: number;
  last_dispatch_at: string | null;
  milestone_branch: string | null;
  milestone_worktree_path: string | null;
  worker_ids: string[];
}

export const INTEGRATION_QUEUE_STATUSES = ["ready", "blocked", "integrated"] as const;
export type IntegrationQueueStatus = (typeof INTEGRATION_QUEUE_STATUSES)[number];

export interface IntegrationQueueItem {
  unit_id: string;
  worker_id: string;
  canonical_commit: string;
  task_branch: string;
  milestone_branch: string;
  worktree_path: string;
  base_commit: string;
  regression_commands: string[];
  status: IntegrationQueueStatus;
  enqueued_at: string;
  last_error: string | null;
}

export interface IntegrationState {
  version: number;
  active_unit_id: string | null;
  queue: IntegrationQueueItem[];
  last_integrated_unit_id: string | null;
  last_integration_commit: string | null;
  last_result: "success" | "blocked" | "failed" | null;
  updated_at: string | null;
}

export interface WorkerDispatchSummary {
  worker_id: string;
  unit_id: string;
  phase_before: WorkerPhase;
  phase_after: WorkerPhase;
  run_id: string | null;
  status: string;
}

export interface ParallelDispatchResult {
  version: number;
  requested_workers: number;
  parallel_state: ParallelState;
  workers: WorkerState[];
  claimed_units: string[];
  advanced_workers: WorkerDispatchSummary[];
}

export interface IntegrationRunResult {
  version: number;
  unit_id: string;
  worker_id: string;
  status: "integrated" | "blocked";
  report_ref: string;
  milestone_branch: string;
  canonical_commit: string;
  integration_commit: string | null;
}

export interface IntegrationReport {
  version: number;
  unit_id: string;
  worker_id: string;
  milestone_branch: string;
  task_branch: string;
  canonical_commit: string;
  base_commit: string;
  preflight: string[];
  regressions: Array<{
    command: string;
    exit_code: number;
    stdout: string;
    stderr: string;
  }>;
  semantic_conflicts: string[];
  summary: string;
  verdict: "integrated" | "blocked";
  generated_at: string;
}

export interface WorkerRecoveryTarget {
  worker_id: string;
  unit_id: string;
  phase: WorkerPhase;
  run_id: string | null;
  state_phase: Phase;
}
