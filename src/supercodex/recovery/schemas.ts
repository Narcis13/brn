import Ajv2020Module from "ajv/dist/2020.js";

import type { ContinuationPacket, RecoveryAssessment, RecoveryCheckpoint } from "./types.js";
import { RECOVERY_CHECKPOINT_KINDS, RECOVERY_DRIFT_SEVERITIES, RECOVERY_RECOMMENDATIONS } from "./types.js";
import { NORMALIZED_STATUSES, RUNTIME_IDS } from "../runtime/types.js";
import { PHASES } from "../types.js";

type Schema = Record<string, unknown>;

const gitSnapshotSchema: Schema = {
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
};

const recoveryCheckpointSchema: Schema = {
  $id: "recovery-checkpoint.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "run_id",
    "kind",
    "unit_id",
    "phase",
    "runtime",
    "state_ref",
    "continuation_ref",
    "git",
    "summary",
    "created_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    kind: { enum: [...RECOVERY_CHECKPOINT_KINDS] },
    unit_id: { type: ["string", "null"] },
    phase: { enum: [...PHASES] },
    runtime: { enum: [...RUNTIME_IDS, null] },
    state_ref: { type: "string", minLength: 1 },
    continuation_ref: { type: "string", minLength: 1 },
    git: gitSnapshotSchema,
    summary: { type: "string", minLength: 1 },
    created_at: { type: "string", minLength: 1 },
  },
};

const continuationPacketSchema: Schema = {
  $id: "continuation-packet.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "run_id",
    "unit_id",
    "action",
    "runtime",
    "status",
    "objective",
    "completed",
    "remaining",
    "best_hypothesis",
    "first_next_step",
    "files_in_play",
    "known_pitfalls",
    "generated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    unit_id: { type: "string", minLength: 1 },
    action: { type: "string", minLength: 1 },
    runtime: { enum: [...RUNTIME_IDS, null] },
    status: { enum: [...NORMALIZED_STATUSES, "pending"] },
    objective: { type: "string", minLength: 1 },
    completed: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    remaining: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    best_hypothesis: { type: "string", minLength: 1 },
    first_next_step: { type: "string", minLength: 1 },
    files_in_play: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    known_pitfalls: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    generated_at: { type: "string", minLength: 1 },
  },
};

const recoveryDriftSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "severity", "message", "ref"],
  properties: {
    code: { type: "string", minLength: 1 },
    severity: { enum: [...RECOVERY_DRIFT_SEVERITIES] },
    message: { type: "string", minLength: 1 },
    ref: { type: ["string", "null"] },
  },
};

const recoveryAssessmentSchema: Schema = {
  $id: "recovery-assessment.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "run_id",
    "unit_id",
    "current_phase",
    "latest_status",
    "recommendation",
    "can_resume",
    "summary",
    "drifts",
    "refs",
    "generated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    unit_id: { type: ["string", "null"] },
    current_phase: { enum: [...PHASES] },
    latest_status: { enum: [...NORMALIZED_STATUSES, "running"] },
    recommendation: { enum: [...RECOVERY_RECOMMENDATIONS] },
    can_resume: { type: "boolean" },
    summary: { type: "string", minLength: 1 },
    drifts: {
      type: "array",
      items: recoveryDriftSchema,
    },
    refs: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    generated_at: { type: "string", minLength: 1 },
  },
};

export const recoverySchemaFileEntries = [
  ["recovery-checkpoint.schema.json", recoveryCheckpointSchema],
  ["continuation-packet.schema.json", continuationPacketSchema],
  ["recovery-assessment.schema.json", recoveryAssessmentSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  checkpoint: ajv.compile<RecoveryCheckpoint>(recoveryCheckpointSchema),
  continuation: ajv.compile<ContinuationPacket>(continuationPacketSchema),
  assessment: ajv.compile<RecoveryAssessment>(recoveryAssessmentSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.checkpoint.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateRecoveryCheckpoint(value: unknown): asserts value is RecoveryCheckpoint {
  if (!validators.checkpoint(value)) {
    throw new Error(formatErrors("recovery checkpoint", validators.checkpoint.errors));
  }
}

export function validateContinuationPacket(value: unknown): asserts value is ContinuationPacket {
  if (!validators.continuation(value)) {
    throw new Error(formatErrors("continuation packet", validators.continuation.errors));
  }
}

export function validateRecoveryAssessment(value: unknown): asserts value is RecoveryAssessment {
  if (!validators.assessment(value)) {
    throw new Error(formatErrors("recovery assessment", validators.assessment.errors));
  }
}
