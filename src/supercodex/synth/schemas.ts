import Ajv2020Module from "ajv/dist/2020.js";

import type { ContextManifest, NextActionDecision, CanonicalRunRecord } from "./types.js";
import { NEXT_ACTION_TYPES } from "./types.js";
import { NORMALIZED_STATUSES, RUNTIME_IDS } from "../runtime/types.js";
import { PHASES } from "../types.js";

type Schema = Record<string, unknown>;

const contextProfiles = ["budget", "balanced", "quality"] as const;

const nextActionDecisionSchema: Schema = {
  $id: "next-action.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "action",
    "unit_id",
    "unit_type",
    "phase",
    "role",
    "runtime",
    "rationale",
    "retry_count",
    "selected_run_id",
    "context_profile",
    "reviewer_pass",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    action: { enum: [...NEXT_ACTION_TYPES] },
    unit_id: { type: ["string", "null"] },
    unit_type: { type: ["string", "null"] },
    phase: { enum: [...PHASES] },
    role: { type: ["string", "null"] },
    runtime: { enum: [...RUNTIME_IDS, null] },
    rationale: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    retry_count: { type: "integer", minimum: 0 },
    selected_run_id: { type: ["string", "null"] },
    context_profile: { enum: [...contextProfiles] },
    reviewer_pass: { type: ["string", "null"] },
  },
};

const contextManifestSchema: Schema = {
  $id: "context-manifest.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "unit_id", "context_profile", "layers", "refs"],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    context_profile: { enum: [...contextProfiles] },
    layers: {
      type: "object",
      additionalProperties: false,
      required: ["system", "unit", "milestone", "supporting", "retry"],
      properties: {
        system: { type: "array", items: { type: "string", minLength: 1 } },
        unit: { type: "array", items: { type: "string", minLength: 1 } },
        milestone: { type: "array", items: { type: "string", minLength: 1 } },
        supporting: { type: "array", items: { type: "string", minLength: 1 } },
        retry: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    refs: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};

const gitSnapshotSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "trunk_branch",
    "milestone_branch",
    "task_branch",
    "worktree_path",
    "head_commit",
    "dirty",
  ],
  properties: {
    trunk_branch: { type: "string", minLength: 1 },
    milestone_branch: { type: ["string", "null"] },
    task_branch: { type: ["string", "null"] },
    worktree_path: { type: ["string", "null"] },
    head_commit: { type: ["string", "null"] },
    dirty: { type: "boolean" },
  },
};

const canonicalRunRecordSchema: Schema = {
  $id: "canonical-run.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "run_id",
    "parent_run_id",
    "unit_id",
    "unit_type",
    "action",
    "role",
    "runtime",
    "status",
    "summary",
    "decision_ref",
    "context_ref",
    "packet_ref",
    "prompt_ref",
    "handle_ref",
    "normalized_ref",
    "raw_ref",
    "continuation_ref",
    "state_ref",
    "started_at",
    "completed_at",
    "retry_count",
    "git_before",
    "git_after",
    "blockers",
    "assumptions",
    "verification_evidence",
    "followups",
    "reviewer_pass",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    parent_run_id: { type: ["string", "null"] },
    unit_id: { type: "string", minLength: 1 },
    unit_type: { type: "string", minLength: 1 },
    action: { enum: ["dispatch", "retry", "resume"] },
    role: { type: "string", minLength: 1 },
    runtime: { enum: [...RUNTIME_IDS] },
    status: { enum: [...NORMALIZED_STATUSES, "running"] },
    summary: { type: "string", minLength: 1 },
    decision_ref: { type: "string", minLength: 1 },
    context_ref: { type: "string", minLength: 1 },
    packet_ref: { type: "string", minLength: 1 },
    prompt_ref: { type: "string", minLength: 1 },
    handle_ref: { type: ["string", "null"] },
    normalized_ref: { type: ["string", "null"] },
    raw_ref: { type: ["string", "null"] },
    continuation_ref: { type: "string", minLength: 1 },
    state_ref: { type: "string", minLength: 1 },
    started_at: { type: "string", minLength: 1 },
    completed_at: { type: ["string", "null"] },
    retry_count: { type: "integer", minimum: 0 },
    git_before: gitSnapshotSchema,
    git_after: {
      anyOf: [
        gitSnapshotSchema,
        { type: "null" },
      ],
    },
    blockers: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    assumptions: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    verification_evidence: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    followups: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    reviewer_pass: { type: ["string", "null"] },
  },
};

export const synthSchemaFileEntries = [
  ["next-action.schema.json", nextActionDecisionSchema],
  ["context-manifest.schema.json", contextManifestSchema],
  ["canonical-run.schema.json", canonicalRunRecordSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  decision: ajv.compile<NextActionDecision>(nextActionDecisionSchema),
  context: ajv.compile<ContextManifest>(contextManifestSchema),
  record: ajv.compile<CanonicalRunRecord>(canonicalRunRecordSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.decision.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateNextActionDecision(value: unknown): asserts value is NextActionDecision {
  if (!validators.decision(value)) {
    throw new Error(formatErrors("next action decision", validators.decision.errors));
  }
}

export function validateContextManifest(value: unknown): asserts value is ContextManifest {
  if (!validators.context(value)) {
    throw new Error(formatErrors("context manifest", validators.context.errors));
  }
}

export function validateCanonicalRunRecord(value: unknown): asserts value is CanonicalRunRecord {
  if (!validators.record(value)) {
    throw new Error(formatErrors("canonical run record", validators.record.errors));
  }
}
