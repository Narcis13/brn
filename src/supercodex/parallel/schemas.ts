import Ajv2020Module from "ajv/dist/2020.js";

import type { IntegrationReport, IntegrationState, ParallelState, WorkerState } from "./types.js";
import { INTEGRATION_QUEUE_STATUSES, WORKER_PHASES, WORKER_STATUSES } from "./types.js";
import { RUNTIME_IDS } from "../runtime/types.js";

type Schema = Record<string, unknown>;

const stringArraySchema: Schema = {
  type: "array",
  items: { type: "string", minLength: 1 },
};

const workerStateSchema: Schema = {
  $id: "worker.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "worker_id",
    "unit_id",
    "phase",
    "status",
    "milestone_id",
    "slice_id",
    "task_id",
    "runtime",
    "role",
    "reviewer_pass",
    "milestone_branch",
    "task_branch",
    "worktree_path",
    "base_commit",
    "current_run_id",
    "last_run_id",
    "canonical_commit",
    "queue_status",
    "owned_resources",
    "assigned_at",
    "updated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    worker_id: { type: "string", minLength: 1 },
    unit_id: { type: "string", minLength: 1 },
    phase: { enum: [...WORKER_PHASES] },
    status: { enum: [...WORKER_STATUSES] },
    milestone_id: { type: "string", minLength: 1 },
    slice_id: { type: "string", minLength: 1 },
    task_id: { type: "string", minLength: 1 },
    runtime: { enum: [...RUNTIME_IDS] },
    role: { type: "string", minLength: 1 },
    reviewer_pass: { type: ["string", "null"] },
    milestone_branch: { type: "string", minLength: 1 },
    task_branch: { type: "string", minLength: 1 },
    worktree_path: { type: "string", minLength: 1 },
    base_commit: { type: "string", minLength: 1 },
    current_run_id: { type: ["string", "null"] },
    last_run_id: { type: ["string", "null"] },
    canonical_commit: { type: ["string", "null"] },
    queue_status: { enum: ["active", "blocked", "ready_to_integrate"] },
    owned_resources: stringArraySchema,
    assigned_at: { type: "string", minLength: 1 },
    updated_at: { type: "string", minLength: 1 },
  },
};

const parallelStateSchema: Schema = {
  $id: "parallel-state.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "max_workers", "last_dispatch_at", "milestone_branch", "milestone_worktree_path", "worker_ids"],
  properties: {
    version: { type: "integer", minimum: 1 },
    max_workers: { type: "integer", minimum: 1 },
    last_dispatch_at: { type: ["string", "null"] },
    milestone_branch: { type: ["string", "null"] },
    milestone_worktree_path: { type: ["string", "null"] },
    worker_ids: stringArraySchema,
  },
};

const integrationQueueItemSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "unit_id",
    "worker_id",
    "canonical_commit",
    "task_branch",
    "milestone_branch",
    "worktree_path",
    "base_commit",
    "regression_commands",
    "status",
    "enqueued_at",
    "last_error",
  ],
  properties: {
    unit_id: { type: "string", minLength: 1 },
    worker_id: { type: "string", minLength: 1 },
    canonical_commit: { type: "string", minLength: 1 },
    task_branch: { type: "string", minLength: 1 },
    milestone_branch: { type: "string", minLength: 1 },
    worktree_path: { type: "string", minLength: 1 },
    base_commit: { type: "string", minLength: 1 },
    regression_commands: stringArraySchema,
    status: { enum: [...INTEGRATION_QUEUE_STATUSES] },
    enqueued_at: { type: "string", minLength: 1 },
    last_error: { type: ["string", "null"] },
  },
};

const integrationStateSchema: Schema = {
  $id: "integration-state.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "active_unit_id",
    "queue",
    "last_integrated_unit_id",
    "last_integration_commit",
    "last_result",
    "updated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    active_unit_id: { type: ["string", "null"] },
    queue: {
      type: "array",
      items: integrationQueueItemSchema,
    },
    last_integrated_unit_id: { type: ["string", "null"] },
    last_integration_commit: { type: ["string", "null"] },
    last_result: { enum: ["success", "blocked", "failed", null] },
    updated_at: { type: ["string", "null"] },
  },
};

const integrationReportSchema: Schema = {
  $id: "integration-report.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "unit_id",
    "worker_id",
    "milestone_branch",
    "task_branch",
    "canonical_commit",
    "base_commit",
    "preflight",
    "regressions",
    "semantic_conflicts",
    "summary",
    "verdict",
    "generated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    worker_id: { type: "string", minLength: 1 },
    milestone_branch: { type: "string", minLength: 1 },
    task_branch: { type: "string", minLength: 1 },
    canonical_commit: { type: "string", minLength: 1 },
    base_commit: { type: "string", minLength: 1 },
    preflight: stringArraySchema,
    regressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["command", "exit_code", "stdout", "stderr"],
        properties: {
          command: { type: "string", minLength: 1 },
          exit_code: { type: "integer" },
          stdout: { type: "string" },
          stderr: { type: "string" },
        },
      },
    },
    semantic_conflicts: stringArraySchema,
    summary: { type: "string", minLength: 1 },
    verdict: { enum: ["integrated", "blocked"] },
    generated_at: { type: "string", minLength: 1 },
  },
};

export const parallelSchemaFileEntries = [
  ["worker.schema.json", workerStateSchema],
  ["parallel-state.schema.json", parallelStateSchema],
  ["integration-state.schema.json", integrationStateSchema],
  ["integration-report.schema.json", integrationReportSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  worker: ajv.compile<WorkerState>(workerStateSchema),
  parallel: ajv.compile<ParallelState>(parallelStateSchema),
  integration: ajv.compile<IntegrationState>(integrationStateSchema),
  report: ajv.compile<IntegrationReport>(integrationReportSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.worker.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateWorkerState(value: unknown): asserts value is WorkerState {
  if (!validators.worker(value)) {
    throw new Error(formatErrors("worker state", validators.worker.errors));
  }
}

export function validateParallelState(value: unknown): asserts value is ParallelState {
  if (!validators.parallel(value)) {
    throw new Error(formatErrors("parallel state", validators.parallel.errors));
  }
}

export function validateIntegrationState(value: unknown): asserts value is IntegrationState {
  if (!validators.integration(value)) {
    throw new Error(formatErrors("integration state", validators.integration.errors));
  }
}

export function validateIntegrationReport(value: unknown): asserts value is IntegrationReport {
  if (!validators.report(value)) {
    throw new Error(formatErrors("integration report", validators.report.errors));
  }
}
