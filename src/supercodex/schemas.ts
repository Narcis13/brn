import Ajv2020Module from "ajv/dist/2020.js";

import type { CurrentState, LockRecord, QueueState, TransitionRecord } from "./types.js";
import { PHASES, QUEUE_STATUSES, UNIT_TYPES } from "./types.js";

type Schema = Record<string, unknown>;

const contextProfiles = ["budget", "balanced", "quality"] as const;

export const currentStateSchema: Schema = {
  $id: "current.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "project_root",
    "context_profile",
    "phase",
    "active_runtime",
    "active_milestone",
    "active_slice",
    "active_task",
    "current_run_id",
    "queue_head",
    "blocked",
    "awaiting_human",
    "git",
    "last_transition_at",
    "last_verified_commit",
    "recovery_ref",
    "metrics",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    project_root: { type: "string", minLength: 1 },
    context_profile: { enum: [...contextProfiles] },
    phase: { enum: [...PHASES] },
    active_runtime: { type: ["string", "null"] },
    active_milestone: { type: ["string", "null"] },
    active_slice: { type: ["string", "null"] },
    active_task: { type: ["string", "null"] },
    current_run_id: { type: ["string", "null"] },
    queue_head: { type: ["string", "null"] },
    blocked: { type: "boolean" },
    awaiting_human: { type: "boolean" },
    git: {
      type: "object",
      additionalProperties: false,
      required: [
        "trunk_branch",
        "milestone_branch",
        "task_branch",
        "worktree_path",
        "base_commit",
        "head_commit",
        "dirty",
      ],
      properties: {
        trunk_branch: { type: "string", minLength: 1 },
        milestone_branch: { type: ["string", "null"] },
        task_branch: { type: ["string", "null"] },
        worktree_path: { type: ["string", "null"] },
        base_commit: { type: ["string", "null"] },
        head_commit: { type: ["string", "null"] },
        dirty: { type: "boolean" },
      },
    },
    last_transition_at: { type: ["string", "null"] },
    last_verified_commit: { type: ["string", "null"] },
    recovery_ref: { type: ["string", "null"] },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: [
        "human_interventions",
        "completed_tasks",
        "failed_attempts",
        "recovered_runs",
      ],
      properties: {
        human_interventions: { type: "integer", minimum: 0 },
        completed_tasks: { type: "integer", minimum: 0 },
        failed_attempts: { type: "integer", minimum: 0 },
        recovered_runs: { type: "integer", minimum: 0 },
      },
    },
  },
};

export const queueStateSchema: Schema = {
  $id: "queue.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "items"],
  properties: {
    version: { type: "integer", minimum: 1 },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["unit_id", "unit_type", "status", "depends_on", "enqueued_at"],
        properties: {
          unit_id: { type: "string", minLength: 1 },
          unit_type: { enum: [...UNIT_TYPES] },
          status: { enum: [...QUEUE_STATUSES] },
          depends_on: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          enqueued_at: { type: "string", minLength: 1 },
          milestone_id: { type: "string" },
          slice_id: { type: "string" },
          task_id: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};

export const lockRecordSchema: Schema = {
  $id: "lock.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["resource", "owner", "scope", "reason", "acquired_at"],
  properties: {
    resource: { type: "string", minLength: 1 },
    owner: { type: "string", minLength: 1 },
    scope: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
    acquired_at: { type: "string", minLength: 1 },
  },
};

export const transitionRecordSchema: Schema = {
  $id: "transition.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "timestamp",
    "from_phase",
    "to_phase",
    "reason",
    "actor",
    "queue_head",
    "blocked",
    "awaiting_human",
  ],
  properties: {
    timestamp: { type: "string", minLength: 1 },
    from_phase: { enum: [...PHASES] },
    to_phase: { enum: [...PHASES] },
    reason: { type: "string", minLength: 1 },
    actor: { type: "string", minLength: 1 },
    unit_id: { type: "string" },
    queue_head: { type: ["string", "null"] },
    blocked: { type: "boolean" },
    awaiting_human: { type: "boolean" },
  },
};

export const schemaFileEntries = [
  ["current.schema.json", currentStateSchema],
  ["queue.schema.json", queueStateSchema],
  ["lock.schema.json", lockRecordSchema],
  ["transition.schema.json", transitionRecordSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  current: ajv.compile<CurrentState>(currentStateSchema),
  queue: ajv.compile<QueueState>(queueStateSchema),
  lock: ajv.compile<LockRecord>(lockRecordSchema),
  transition: ajv.compile<TransitionRecord>(transitionRecordSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.current.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateCurrentState(value: unknown): asserts value is CurrentState {
  if (!validators.current(value)) {
    throw new Error(formatErrors("current.json", validators.current.errors));
  }
}

export function validateQueueState(value: unknown): asserts value is QueueState {
  if (!validators.queue(value)) {
    throw new Error(formatErrors("queue.json", validators.queue.errors));
  }
}

export function validateLockRecord(value: unknown): asserts value is LockRecord {
  if (!validators.lock(value)) {
    throw new Error(formatErrors("lock record", validators.lock.errors));
  }
}

export function validateTransitionRecord(value: unknown): asserts value is TransitionRecord {
  if (!validators.transition(value)) {
    throw new Error(formatErrors("transition record", validators.transition.errors));
  }
}
