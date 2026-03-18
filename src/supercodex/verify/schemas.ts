import Ajv2020Module from "ajv/dist/2020.js";

import type { CompletionRecord, ReviewReport, VerificationReport } from "./types.js";
import { REVIEW_VERDICTS, VERIFICATION_VERDICTS } from "./types.js";
import { TASK_TDD_MODES } from "../planning/types.js";

type Schema = Record<string, unknown>;

const stringArraySchema: Schema = {
  type: "array",
  items: { type: "string", minLength: 1 },
};

const verificationLadderSchema: Schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "static",
    "focused_tests",
    "behavioral",
    "slice_regression",
    "milestone_regression",
    "human_uat",
  ],
  properties: {
    static: stringArraySchema,
    focused_tests: stringArraySchema,
    behavioral: stringArraySchema,
    slice_regression: stringArraySchema,
    milestone_regression: stringArraySchema,
    human_uat: stringArraySchema,
  },
};

const verificationReportSchema: Schema = {
  $id: "verification-report.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "unit_id",
    "implementation_run_id",
    "verification_run_id",
    "tdd_mode",
    "tdd_justification",
    "required_reviewers",
    "ladder",
    "tests_written",
    "tests_run",
    "evidence",
    "summary",
    "findings",
    "followups",
    "verdict",
    "generated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    implementation_run_id: { type: "string", minLength: 1 },
    verification_run_id: { type: "string", minLength: 1 },
    tdd_mode: { enum: [...TASK_TDD_MODES] },
    tdd_justification: { type: ["string", "null"] },
    required_reviewers: stringArraySchema,
    ladder: verificationLadderSchema,
    tests_written: stringArraySchema,
    tests_run: stringArraySchema,
    evidence: stringArraySchema,
    summary: { type: "string", minLength: 1 },
    findings: stringArraySchema,
    followups: stringArraySchema,
    verdict: { enum: [...VERIFICATION_VERDICTS] },
    generated_at: { type: "string", minLength: 1 },
  },
};

const reviewReportSchema: Schema = {
  $id: "review-report.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "unit_id",
    "persona",
    "verification_run_id",
    "review_run_id",
    "summary",
    "findings",
    "followups",
    "verdict",
    "generated_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    persona: { type: "string", minLength: 1 },
    verification_run_id: { type: "string", minLength: 1 },
    review_run_id: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    findings: stringArraySchema,
    followups: stringArraySchema,
    verdict: { enum: [...REVIEW_VERDICTS] },
    generated_at: { type: "string", minLength: 1 },
  },
};

const completionRecordSchema: Schema = {
  $id: "completion-record.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "unit_id",
    "implementation_run_id",
    "verification_run_id",
    "review_run_ids",
    "summary",
    "completed_at",
  ],
  properties: {
    version: { type: "integer", minimum: 1 },
    unit_id: { type: "string", minLength: 1 },
    implementation_run_id: { type: "string", minLength: 1 },
    verification_run_id: { type: "string", minLength: 1 },
    review_run_ids: {
      type: "object",
      additionalProperties: { type: "string", minLength: 1 },
    },
    summary: { type: "string", minLength: 1 },
    completed_at: { type: "string", minLength: 1 },
  },
};

export const verifySchemaFileEntries = [
  ["verification-report.schema.json", verificationReportSchema],
  ["review-report.schema.json", reviewReportSchema],
  ["completion-record.schema.json", completionRecordSchema],
] as const;

const ajv = new Ajv2020Module.default({ allErrors: true });

const validators = {
  verification: ajv.compile<VerificationReport>(verificationReportSchema),
  review: ajv.compile<ReviewReport>(reviewReportSchema),
  completion: ajv.compile<CompletionRecord>(completionRecordSchema),
};

function formatErrors(schemaName: string, errors: typeof validators.verification.errors): string {
  const details = (errors ?? [])
    .map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");

  return `${schemaName} validation failed: ${details}`;
}

export function validateVerificationReport(value: unknown): asserts value is VerificationReport {
  if (!validators.verification(value)) {
    throw new Error(formatErrors("verification report", validators.verification.errors));
  }
}

export function validateReviewReport(value: unknown): asserts value is ReviewReport {
  if (!validators.review(value)) {
    throw new Error(formatErrors("review report", validators.review.errors));
  }
}

export function validateCompletionRecord(value: unknown): asserts value is CompletionRecord {
  if (!validators.completion(value)) {
    throw new Error(formatErrors("completion record", validators.completion.errors));
  }
}
