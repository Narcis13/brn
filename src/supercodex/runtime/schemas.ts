import Ajv2020Module from "ajv/dist/2020.js";

import type {
  DispatchPacket,
  NormalizedResult,
  RuntimeCollectResult,
  RuntimeModelResponse,
  RuntimeProbeResult,
  RuntimeRegistry,
  RuntimeRunHandle,
} from "./types.js";
import { NORMALIZED_STATUSES, RUNTIME_CAPABILITIES, RUNTIME_IDS, RUNTIME_RUN_STATUSES } from "./types.js";

type Schema = Record<string, unknown>;

const dispatchPacketSchema: Schema = {
  $id: "dispatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "unit_id",
    "unit_type",
    "role",
    "objective",
    "context_refs",
    "acceptance_criteria",
    "files_in_scope",
    "tests",
    "verification_plan",
    "constraints",
    "safety_class",
    "output_contract",
    "stop_conditions",
    "artifacts_to_update",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    unit_type: { type: "string", minLength: 1 },
    role: { type: "string", minLength: 1 },
    objective: { type: "string", minLength: 1 },
    context_refs: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    acceptance_criteria: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    files_in_scope: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    tests: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    verification_plan: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    constraints: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    safety_class: { type: "string", minLength: 1 },
    output_contract: {
      type: "object",
      additionalProperties: false,
      required: [
        "must_update_artifacts",
        "must_produce_evidence",
        "must_not_claim_done_without_verification",
      ],
      properties: {
        must_update_artifacts: { type: "boolean" },
        must_produce_evidence: { type: "boolean" },
        must_not_claim_done_without_verification: { type: "boolean" },
        notes: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    stop_conditions: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    artifacts_to_update: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};

export const runtimeModelResponseSchema: Schema = {
  $id: "runtime-model-response.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "summary",
    "tests_written",
    "tests_run",
    "verification_evidence",
    "assumptions",
    "blockers",
    "followups",
  ],
  properties: {
    status: { enum: [...NORMALIZED_STATUSES] },
    summary: { type: "string", minLength: 1 },
    tests_written: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    tests_run: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    verification_evidence: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    assumptions: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    blockers: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    followups: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};

const normalizedResultSchema: Schema = {
  $id: "result.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "run_id",
    "runtime",
    "status",
    "summary",
    "files_changed",
    "tests_written",
    "tests_run",
    "verification_evidence",
    "assumptions",
    "blockers",
    "followups",
    "raw_ref",
    "exit_code",
    "started_at",
    "completed_at",
    "session_id",
  ],
  properties: {
    run_id: { type: "string", minLength: 1 },
    runtime: { enum: [...RUNTIME_IDS] },
    status: { enum: [...NORMALIZED_STATUSES] },
    summary: { type: "string", minLength: 1 },
    files_changed: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    tests_written: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    tests_run: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    verification_evidence: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    assumptions: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    blockers: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    followups: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    raw_ref: { type: "string", minLength: 1 },
    exit_code: { type: "integer" },
    started_at: { type: "string", minLength: 1 },
    completed_at: { type: "string", minLength: 1 },
    session_id: { type: ["string", "null"] },
  },
};

const probeResultSchema: Schema = {
  $id: "probe.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "runtime",
    "display_name",
    "command",
    "enabled",
    "configured",
    "capabilities",
    "available",
    "path",
    "version",
    "checked_at",
    "error",
  ],
  properties: {
    runtime: { enum: [...RUNTIME_IDS] },
    display_name: { type: "string", minLength: 1 },
    command: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
    configured: { type: "boolean" },
    capabilities: {
      type: "array",
      items: { enum: [...RUNTIME_CAPABILITIES] },
    },
    available: { type: "boolean" },
    path: { type: ["string", "null"] },
    version: { type: ["string", "null"] },
    checked_at: { type: "string", minLength: 1 },
    error: { type: ["string", "null"] },
  },
};

const runtimeRegistryEntrySchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["display_name", "command", "enabled", "configured", "capabilities"],
  properties: {
    display_name: { type: "string", minLength: 1 },
    command: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
    configured: { type: "boolean" },
    capabilities: {
      type: "array",
      items: { enum: [...RUNTIME_CAPABILITIES] },
    },
    default_args: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
    last_probe: {
      type: "object",
      additionalProperties: false,
      required: ["available", "path", "version", "checked_at", "error"],
      properties: {
        available: { type: "boolean" },
        path: { type: ["string", "null"] },
        version: { type: ["string", "null"] },
        checked_at: { type: "string", minLength: 1 },
        error: { type: ["string", "null"] },
      },
    },
  },
};

const runtimeRegistrySchema: Schema = {
  $id: "runtime-registry.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "runtimes"],
  properties: {
    version: { type: "integer", minimum: 1 },
    runtimes: {
      type: "object",
      additionalProperties: false,
      required: [...RUNTIME_IDS],
      properties: {
        claude: runtimeRegistryEntrySchema,
        codex: runtimeRegistryEntrySchema,
      },
    },
  },
};

const runtimeRunHandleSchema: Schema = {
  $id: "runtime-handle.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "run_id",
    "runtime",
    "parent_run_id",
    "session_id",
    "command",
    "args",
    "cwd",
    "packet_ref",
    "prompt_ref",
    "response_ref",
    "stdout_ref",
    "stderr_ref",
    "normalized_ref",
    "started_at",
    "completed_at",
    "exit_code",
    "status",
    "pid",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    runtime: { enum: [...RUNTIME_IDS] },
    parent_run_id: { type: ["string", "null"] },
    session_id: { type: ["string", "null"] },
    command: { type: "string", minLength: 1 },
    args: {
      type: "array",
      items: { type: "string" },
    },
    cwd: { type: "string", minLength: 1 },
    packet_ref: { type: "string", minLength: 1 },
    prompt_ref: { type: "string", minLength: 1 },
    response_ref: { type: "string", minLength: 1 },
    stdout_ref: { type: "string", minLength: 1 },
    stderr_ref: { type: "string", minLength: 1 },
    normalized_ref: { type: "string", minLength: 1 },
    started_at: { type: "string", minLength: 1 },
    completed_at: { type: ["string", "null"] },
    exit_code: { type: ["integer", "null"] },
    status: { enum: [...RUNTIME_RUN_STATUSES] },
    pid: { type: ["integer", "null"] },
  },
};

export const runtimeSchemaFileEntries = [
  ["dispatch.schema.json", dispatchPacketSchema],
  ["result.schema.json", normalizedResultSchema],
  ["probe.schema.json", probeResultSchema],
  ["runtime-registry.schema.json", runtimeRegistrySchema],
  ["runtime-handle.schema.json", runtimeRunHandleSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  dispatch: ajv.compile<DispatchPacket>(dispatchPacketSchema),
  modelResponse: ajv.compile<RuntimeModelResponse>(runtimeModelResponseSchema),
  normalizedResult: ajv.compile<NormalizedResult>(normalizedResultSchema),
  probe: ajv.compile<RuntimeProbeResult>(probeResultSchema),
  registry: ajv.compile<RuntimeRegistry>(runtimeRegistrySchema),
  handle: ajv.compile<RuntimeRunHandle>(runtimeRunHandleSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.dispatch.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateDispatchPacket(value: unknown): asserts value is DispatchPacket {
  if (!validators.dispatch(value)) {
    throw new Error(formatErrors("dispatch packet", validators.dispatch.errors));
  }
}

export function validateRuntimeModelResponse(value: unknown): asserts value is RuntimeModelResponse {
  if (!validators.modelResponse(value)) {
    throw new Error(formatErrors("runtime model response", validators.modelResponse.errors));
  }
}

export function validateNormalizedResult(value: unknown): asserts value is NormalizedResult {
  if (!validators.normalizedResult(value)) {
    throw new Error(formatErrors("normalized result", validators.normalizedResult.errors));
  }
}

export function validateRuntimeProbeResult(value: unknown): asserts value is RuntimeProbeResult {
  if (!validators.probe(value)) {
    throw new Error(formatErrors("runtime probe result", validators.probe.errors));
  }
}

export function validateRuntimeRegistry(value: unknown): asserts value is RuntimeRegistry {
  if (!validators.registry(value)) {
    throw new Error(formatErrors("runtime registry", validators.registry.errors));
  }
}

export function validateRuntimeRunHandle(value: unknown): asserts value is RuntimeRunHandle {
  if (!validators.handle(value)) {
    throw new Error(formatErrors("runtime handle", validators.handle.errors));
  }
}

export function validateRuntimeCollectResult(value: unknown): asserts value is RuntimeCollectResult {
  const typed = value as RuntimeCollectResult;
  validateRuntimeRunHandle(typed.handle);
  if (typed.result !== null) {
    validateNormalizedResult(typed.result);
  }
}
