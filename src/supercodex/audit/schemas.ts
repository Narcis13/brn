import Ajv2020Module from "ajv/dist/2020.js";

import type { MemoryAuditReport, PostmortemReport } from "./types.js";
import { AUDIT_FINDING_SEVERITIES, AUDIT_TRIGGERS, AUDIT_VERDICTS, POSTMORTEM_TRIGGERS } from "./types.js";

type Schema = Record<string, unknown>;

const auditFindingSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["severity", "code", "message", "ref"],
  properties: {
    severity: { enum: [...AUDIT_FINDING_SEVERITIES] },
    code: { type: "string", minLength: 1 },
    message: { type: "string", minLength: 1 },
    ref: { type: ["string", "null"] },
  },
};

const memoryAuditReportSchema: Schema = {
  $id: "memory-audit.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "unit_id", "unit_type", "trigger", "verdict", "summary", "findings", "refs", "generated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    unit_type: { type: "string", minLength: 1 },
    trigger: { enum: [...AUDIT_TRIGGERS] },
    verdict: { enum: [...AUDIT_VERDICTS] },
    summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: auditFindingSchema,
    },
    refs: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    generated_at: { type: "string", minLength: 1 },
  },
};

const postmortemReportSchema: Schema = {
  $id: "postmortem.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["version", "run_id", "unit_id", "trigger", "summary", "findings", "followups", "evidence_refs", "generated_at"],
  properties: {
    version: { type: "integer", minimum: 1 },
    run_id: { type: "string", minLength: 1 },
    unit_id: { type: ["string", "null"] },
    trigger: { enum: [...POSTMORTEM_TRIGGERS] },
    summary: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: auditFindingSchema,
    },
    followups: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    evidence_refs: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    generated_at: { type: "string", minLength: 1 },
  },
};

export const auditSchemaFileEntries = [
  ["memory-audit.schema.json", memoryAuditReportSchema],
  ["postmortem.schema.json", postmortemReportSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  memory: ajv.compile<MemoryAuditReport>(memoryAuditReportSchema),
  postmortem: ajv.compile<PostmortemReport>(postmortemReportSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.memory.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateMemoryAuditReport(value: unknown): asserts value is MemoryAuditReport {
  if (!validators.memory(value)) {
    throw new Error(formatErrors("memory audit report", validators.memory.errors));
  }
}

export function validatePostmortemReport(value: unknown): asserts value is PostmortemReport {
  if (!validators.postmortem(value)) {
    throw new Error(formatErrors("postmortem report", validators.postmortem.errors));
  }
}
