export const RUNTIME_IDS = ["claude", "codex"] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];

export const RUNTIME_CAPABILITIES = [
  "images",
  "long_shell",
  "non_interactive",
  "patching",
  "resume",
  "structured_output",
  "subagents",
] as const;
export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

export const NORMALIZED_STATUSES = ["success", "failed", "blocked", "interrupted"] as const;
export type NormalizedStatus = (typeof NORMALIZED_STATUSES)[number];

export const RUNTIME_RUN_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export type RuntimeRunStatus = (typeof RUNTIME_RUN_STATUSES)[number];

export interface RuntimeProbeSnapshot {
  available: boolean;
  path: string | null;
  version: string | null;
  checked_at: string;
  error: string | null;
}

export interface RuntimeRegistryEntry {
  display_name: string;
  command: string;
  enabled: boolean;
  configured: boolean;
  capabilities: RuntimeCapability[];
  default_args?: string[];
  notes?: string;
  last_probe?: RuntimeProbeSnapshot;
}

export interface RuntimeRegistry {
  version: number;
  runtimes: Record<RuntimeId, RuntimeRegistryEntry>;
}

export interface RuntimeProbeResult extends RuntimeProbeSnapshot {
  runtime: RuntimeId;
  display_name: string;
  command: string;
  enabled: boolean;
  configured: boolean;
  capabilities: RuntimeCapability[];
}

export interface DispatchPacketOutputContract {
  must_update_artifacts: boolean;
  must_produce_evidence: boolean;
  must_not_claim_done_without_verification: boolean;
  notes?: string[];
}

export interface DispatchPacket {
  version: number;
  unit_id: string;
  unit_type: string;
  role: string;
  objective: string;
  context_refs: string[];
  acceptance_criteria: string[];
  files_in_scope: string[];
  tests: string[];
  verification_plan: string[];
  constraints: string[];
  safety_class: string;
  output_contract: DispatchPacketOutputContract;
  stop_conditions: string[];
  artifacts_to_update: string[];
}

export interface RuntimeModelResponse {
  status: NormalizedStatus;
  summary: string;
  tests_written: string[];
  tests_run: string[];
  verification_evidence: string[];
  assumptions: string[];
  blockers: string[];
  followups: string[];
}

export interface NormalizedResult extends RuntimeModelResponse {
  run_id: string;
  runtime: RuntimeId;
  files_changed: string[];
  raw_ref: string;
  exit_code: number;
  started_at: string;
  completed_at: string;
  session_id: string | null;
}

export interface RuntimeRunHandle {
  version: number;
  run_id: string;
  runtime: RuntimeId;
  parent_run_id: string | null;
  session_id: string | null;
  command: string;
  args: string[];
  cwd: string;
  packet_ref: string;
  prompt_ref: string;
  response_ref: string;
  stdout_ref: string;
  stderr_ref: string;
  normalized_ref: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  status: RuntimeRunStatus;
  pid: number | null;
}

export interface RuntimeDispatchResult {
  handle: RuntimeRunHandle;
  result: NormalizedResult;
}

export interface RuntimeCollectResult {
  handle: RuntimeRunHandle;
  result: NormalizedResult | null;
}
