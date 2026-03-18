import { listFiles, readJsonFile, readText, readTextIfExists, writeJsonFile, writeTextAtomic } from "../fs.js";
import {
  listTaskIds,
  loadTaskArtifact,
  parseUnitId,
} from "../planning/index.js";
import { resolveRepoPath } from "../paths.js";
import { listCanonicalRunRecordsForUnit } from "../synth/runs.js";
import type { CanonicalRunRecord } from "../synth/types.js";
import type { TaskTddMode } from "../planning/types.js";
import { validateCompletionRecord, validateReviewReport, validateVerificationReport } from "./schemas.js";
import type {
  CompletionRecord,
  ReviewReport,
  TaskVerificationState,
  VerificationReport,
} from "./types.js";

const VERIFY_ROOT = ".supercodex/verify";
const DEFAULT_REVIEWERS = ["correctness", "maintainability", "security"];

interface RuntimePolicies {
  review_style?: string[];
}

export interface TaskVerificationPaths {
  dir: string;
  verification_ref: string;
  reviews_dir: string;
  completion_ref: string;
}

function ensureTaskUnitId(unitId: string): { milestone_id: string; slice_id: string; task_id: string } {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id || !parsed.task_id) {
    throw new Error(`Verification artifacts require a task unit id, received ${unitId}.`);
  }

  return {
    milestone_id: parsed.milestone_id,
    slice_id: parsed.slice_id,
    task_id: parsed.task_id,
  };
}

function reviewFileName(persona: string): string {
  return `${persona.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "review"}.json`;
}

function readJsonIfExists<T>(root: string, ref: string): T | null {
  const path = resolveRepoPath(root, ref);
  return readTextIfExists(path) ? readJsonFile<T>(path) : null;
}

function loadTaskArtifactForUnit(root: string, unitId: string) {
  const parsed = ensureTaskUnitId(unitId);
  return loadTaskArtifact(root, parsed.milestone_id, parsed.slice_id, parsed.task_id);
}

function taskFileRef(unitId: string): string {
  const parsed = ensureTaskUnitId(unitId);
  return `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/tasks/${parsed.task_id}.md`;
}

function sliceSummaryRef(unitId: string): string {
  const parsed = ensureTaskUnitId(unitId);
  return `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/summary.md`;
}

function milestoneUatRef(unitId: string): string {
  const parsed = ensureTaskUnitId(unitId);
  return `vault/milestones/${parsed.milestone_id}/uat.md`;
}

function loadPolicyReviewers(root: string): string[] {
  const policies = readJsonIfExists<RuntimePolicies>(root, ".supercodex/runtime/policies.json");
  const reviewers = Array.isArray(policies?.review_style)
    ? policies.review_style.map((entry) => String(entry).trim()).filter(Boolean)
    : [];

  return reviewers.length > 0 ? reviewers : [...DEFAULT_REVIEWERS];
}

function resolveRequiredReviewers(root: string, unitId: string, report?: VerificationReport | null): string[] {
  if (report?.required_reviewers.length) {
    return [...report.required_reviewers];
  }

  const artifact = loadTaskArtifactForUnit(root, unitId);
  return artifact.reviewer_passes.length > 0 ? [...artifact.reviewer_passes] : loadPolicyReviewers(root);
}

function latestSuccessfulImplementationRun(root: string, unitId: string): CanonicalRunRecord | null {
  return (
    listCanonicalRunRecordsForUnit(root, unitId)
      .filter((record) => record.role === "implementer" && record.unit_type === "task" && record.status === "success")
      .at(-1) ?? null
  );
}

function validateVerificationSemantics(
  report: VerificationReport,
  unitId: string,
  taskTddMode: TaskTddMode,
  requiredReviewers: string[],
): void {
  if (report.unit_id !== unitId) {
    throw new Error(`Verification report ${unitId} points at ${report.unit_id}.`);
  }

  if (report.tdd_mode !== taskTddMode) {
    throw new Error(`Verification report ${unitId} does not match task TDD mode ${taskTddMode}.`);
  }

  if (taskTddMode !== "strict_tdd" && !report.tdd_justification?.trim()) {
    throw new Error(`Verification report ${unitId} must carry a TDD justification for ${taskTddMode}.`);
  }

  if (requiredReviewers.length === 0) {
    throw new Error(`Verification report ${unitId} resolved zero reviewer passes.`);
  }

  if (report.required_reviewers.join("\n") !== requiredReviewers.join("\n")) {
    throw new Error(`Verification report ${unitId} reviewers do not match the deterministic reviewer order.`);
  }

  if (report.verdict === "pass" && report.evidence.length === 0) {
    throw new Error(`Verification report ${unitId} cannot pass without evidence.`);
  }

  if (taskTddMode === "strict_tdd") {
    if (report.tests_written.length === 0) {
      throw new Error(`Strict TDD verification for ${unitId} must report written tests.`);
    }
    if (report.ladder.focused_tests.length === 0) {
      throw new Error(`Strict TDD verification for ${unitId} must record focused test execution.`);
    }
  }

  if (taskTddMode === "brownfield_tdd" && report.ladder.focused_tests.length === 0) {
    throw new Error(`Brownfield TDD verification for ${unitId} must record focused test execution.`);
  }

  if (
    taskTddMode === "verification_first" &&
    report.ladder.behavioral.length === 0 &&
    report.ladder.static.length === 0 &&
    report.ladder.human_uat.length === 0
  ) {
    throw new Error(`Verification-first work for ${unitId} must record non-test verification evidence.`);
  }
}

function validateReviewSemantics(report: ReviewReport, unitId: string, verificationRunId: string): void {
  if (report.unit_id !== unitId) {
    throw new Error(`Review report ${unitId}/${report.persona} points at ${report.unit_id}.`);
  }

  if (report.verification_run_id !== verificationRunId) {
    throw new Error(`Review report ${unitId}/${report.persona} is stale for verification run ${verificationRunId}.`);
  }
}

function replaceMarkdownSection(text: string, heading: string, bodyLines: string[]): string {
  const lines = text.split("\n");
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);

  if (start === -1) {
    const suffix = text.endsWith("\n") ? "" : "\n";
    return `${text}${suffix}\n${headingLine}\n\n${bodyLines.join("\n")}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const nextLines = [...lines.slice(0, start + 1), "", ...bodyLines, "", ...lines.slice(end)];
  return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function replaceSliceSection(text: string, heading: string, bodyLines: string[]): string {
  const lines = text.split("\n");
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);

  if (start === -1) {
    const prefix = text.trimEnd();
    return `${prefix}\n\n${headingLine}\n\n${bodyLines.join("\n")}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const nextLines = [...lines.slice(0, start + 1), "", ...bodyLines, "", ...lines.slice(end)];
  return `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function greenReviewForPersona(reviews: ReviewReport[], persona: string, verificationRunId: string): ReviewReport | null {
  return (
    reviews
      .filter((review) => review.persona === persona && review.verification_run_id === verificationRunId && review.verdict === "green")
      .at(-1) ?? null
  );
}

export function getTaskVerificationPaths(unitId: string): TaskVerificationPaths {
  const parsed = ensureTaskUnitId(unitId);
  const dir = `${VERIFY_ROOT}/${parsed.milestone_id}/${parsed.slice_id}/${parsed.task_id}`;
  return {
    dir,
    verification_ref: `${dir}/verification.json`,
    reviews_dir: `${dir}/reviews`,
    completion_ref: `${dir}/completion.json`,
  };
}

export function reviewReportRef(unitId: string, persona: string): string {
  const paths = getTaskVerificationPaths(unitId);
  return `${paths.reviews_dir}/${reviewFileName(persona)}`;
}

export function loadVerificationReport(root: string, unitId: string): VerificationReport | null {
  const report = readJsonIfExists<VerificationReport>(root, getTaskVerificationPaths(unitId).verification_ref);
  if (!report) {
    return null;
  }

  validateVerificationReport(report);
  return report;
}

export function saveVerificationReport(root: string, report: VerificationReport): string {
  validateVerificationReport(report);
  const ref = getTaskVerificationPaths(report.unit_id).verification_ref;
  writeJsonFile(resolveRepoPath(root, ref), report);
  return ref;
}

export function listReviewReports(root: string, unitId: string): ReviewReport[] {
  const paths = getTaskVerificationPaths(unitId);
  const directory = resolveRepoPath(root, paths.reviews_dir);

  return listFiles(directory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => {
      const report = readJsonFile<ReviewReport>(resolveRepoPath(root, `${paths.reviews_dir}/${fileName}`));
      validateReviewReport(report);
      return report;
    })
    .sort((left, right) => left.persona.localeCompare(right.persona) || left.generated_at.localeCompare(right.generated_at));
}

export function saveReviewReport(root: string, report: ReviewReport): string {
  validateReviewReport(report);
  const ref = reviewReportRef(report.unit_id, report.persona);
  writeJsonFile(resolveRepoPath(root, ref), report);
  return ref;
}

export function loadCompletionRecord(root: string, unitId: string): CompletionRecord | null {
  const record = readJsonIfExists<CompletionRecord>(root, getTaskVerificationPaths(unitId).completion_ref);
  if (!record) {
    return null;
  }

  validateCompletionRecord(record);
  return record;
}

export function saveCompletionRecord(root: string, record: CompletionRecord): string {
  validateCompletionRecord(record);
  const ref = getTaskVerificationPaths(record.unit_id).completion_ref;
  writeJsonFile(resolveRepoPath(root, ref), record);
  return ref;
}

export function getTaskVerificationState(root: string, unitId: string): TaskVerificationState {
  const artifact = loadTaskArtifactForUnit(root, unitId);
  const implementation = latestSuccessfulImplementationRun(root, unitId);
  const rawVerification = loadVerificationReport(root, unitId);
  const requiredReviewers = resolveRequiredReviewers(root, unitId, rawVerification);
  let verification: VerificationReport | null = null;

  if (implementation && rawVerification && rawVerification.implementation_run_id === implementation.run_id) {
    validateVerificationSemantics(rawVerification, unitId, artifact.tdd_mode, requiredReviewers);
    verification = rawVerification;
  }

  const reviews = verification
    ? listReviewReports(root, unitId)
        .map((review) => {
          validateReviewSemantics(review, unitId, verification.verification_run_id);
          return review;
        })
        .filter((review) => review.verification_run_id === verification.verification_run_id)
    : [];

  const pendingReviewers =
    verification?.verdict === "pass"
      ? requiredReviewers.filter((persona) => !greenReviewForPersona(reviews, persona, verification.verification_run_id))
      : [];

  const completion = loadCompletionRecord(root, unitId);
  const completionValid =
    !!completion &&
    completion.implementation_run_id === implementation?.run_id &&
    completion.verification_run_id === verification?.verification_run_id &&
    requiredReviewers.every((persona) => {
      const review = greenReviewForPersona(reviews, persona, verification?.verification_run_id ?? "");
      return review && completion.review_run_ids[persona] === review.review_run_id;
    });

  const status: TaskVerificationState["status"] = completionValid
    ? "complete"
    : !implementation
      ? "implement"
      : !verification
        ? "verify"
        : verification.verdict !== "pass"
          ? "implement"
          : pendingReviewers.length > 0
            ? "review"
            : "complete";

  return {
    unit_id: unitId,
    implementation_run_id: implementation?.run_id ?? null,
    verification,
    reviews,
    completion: completionValid ? completion : null,
    required_reviewers: requiredReviewers,
    pending_reviewers: pendingReviewers,
    next_reviewer: pendingReviewers[0] ?? null,
    status,
  };
}

export function verificationDoctorIssues(root: string, unitId: string): string[] {
  const issues: string[] = [];
  const artifact = loadTaskArtifactForUnit(root, unitId);
  const state = getTaskVerificationState(root, unitId);

  if (!state.implementation_run_id) {
    issues.push(`Task ${unitId} has no successful implementation run to verify.`);
    return issues;
  }

  if (!state.verification) {
    issues.push(`Task ${unitId} is missing a current verification report.`);
    return issues;
  }

  if (state.verification.verdict !== "pass") {
    issues.push(`Task ${unitId} verification verdict is ${state.verification.verdict}.`);
  }

  for (const reviewer of state.required_reviewers) {
    if (!greenReviewForPersona(state.reviews, reviewer, state.verification.verification_run_id)) {
      issues.push(`Task ${unitId} is missing a green ${reviewer} review.`);
    }
  }

  if (!state.completion) {
    issues.push(`Task ${unitId} is missing a completion record.`);
  }

  if (artifact.status === "completed" && !state.completion) {
    issues.push(`Task ${unitId} is marked completed in markdown without completion.json.`);
  }

  return issues;
}

export function writeTaskCompletionArtifacts(root: string, unitId: string): CompletionRecord {
  const state = getTaskVerificationState(root, unitId);
  if (!state.implementation_run_id || !state.verification || state.verification.verdict !== "pass" || state.pending_reviewers.length > 0) {
    throw new Error(`Task ${unitId} is not ready for deterministic completion.`);
  }

  const greenReviews = Object.fromEntries(
    state.required_reviewers.map((persona) => {
      const review = greenReviewForPersona(state.reviews, persona, state.verification!.verification_run_id);
      if (!review) {
        throw new Error(`Task ${unitId} is missing a green ${persona} review.`);
      }
      return [persona, review.review_run_id];
    }),
  );

  const summary = [
    state.verification.summary,
    `Verification passed with reviewer sign-off: ${state.required_reviewers.join(", ")}.`,
  ].join(" ");

  const completion: CompletionRecord = {
    version: 1,
    unit_id: unitId,
    implementation_run_id: state.implementation_run_id,
    verification_run_id: state.verification.verification_run_id,
    review_run_ids: greenReviews,
    summary,
    completed_at: new Date().toISOString(),
  };
  saveCompletionRecord(root, completion);

  const taskRef = taskFileRef(unitId);
  let taskText = readText(resolveRepoPath(root, taskRef));
  taskText = replaceMarkdownSection(taskText, "Status", ["completed"]);
  taskText = replaceMarkdownSection(taskText, "Summary", [summary]);
  writeTextAtomic(resolveRepoPath(root, taskRef), taskText);

  return completion;
}

export function refreshSliceSummary(root: string, unitId: string): string {
  const parsed = ensureTaskUnitId(unitId);
  const taskIds = listTaskIds(root, parsed.milestone_id, parsed.slice_id);
  const completedTaskIds = taskIds.filter((taskId) =>
    loadCompletionRecord(root, `${parsed.milestone_id}/${parsed.slice_id}/${taskId}`),
  );
  const summaryRef = sliceSummaryRef(unitId);
  const body = [
    `# ${parsed.slice_id} Summary`,
    "",
    "Status: complete",
    "",
    `This slice is complete. Completed tasks: ${completedTaskIds.join(", ")}.`,
  ].join("\n");
  writeTextAtomic(resolveRepoPath(root, summaryRef), `${body}\n`);
  return summaryRef;
}

export function generateSliceUat(root: string, sliceUnitId: string): string {
  const parsed = parseUnitId(sliceUnitId);
  if (parsed.kind !== "slice" || !parsed.milestone_id || !parsed.slice_id) {
    throw new Error(`Slice UAT generation requires a slice unit id, received ${sliceUnitId}.`);
  }

  const taskIds = listTaskIds(root, parsed.milestone_id, parsed.slice_id);
  const lines: string[] = [];
  let step = 1;

  for (const taskId of taskIds) {
    const unitId = `${parsed.milestone_id}/${parsed.slice_id}/${taskId}`;
    const artifact = loadTaskArtifactForUnit(root, unitId);
    const completion = loadCompletionRecord(root, unitId);
    const uatSteps = artifact.verification_ladder.human_uat;

    if (uatSteps.length === 0) {
      lines.push(`${step}. Inspect \`${getTaskVerificationPaths(unitId).completion_ref}\` and confirm ${taskId} stayed complete after verification.`);
      step += 1;
      continue;
    }

    for (const entry of uatSteps) {
      lines.push(`${step}. (${taskId}) ${entry}`);
      step += 1;
    }

    if (completion) {
      lines.push(`${step}. (${taskId}) Confirm the completion summary matches the verified outcome in \`${getTaskVerificationPaths(unitId).completion_ref}\`.`);
      step += 1;
    }
  }

  if (lines.length === 0) {
    lines.push("1. No slice tasks were found for UAT generation.");
  }

  const ref = milestoneUatRef(`${parsed.milestone_id}/${parsed.slice_id}/T01`);
  const path = resolveRepoPath(root, ref);
  const current = readTextIfExists(path) ?? `# ${parsed.milestone_id} UAT\n`;
  const next = replaceSliceSection(current, `${parsed.milestone_id}/${parsed.slice_id}`, lines);
  writeTextAtomic(path, next);
  return ref;
}

export function formatTaskVerificationState(state: TaskVerificationState): string {
  return [
    `Task: ${state.unit_id}`,
    `Status: ${state.status}`,
    `Implementation run: ${state.implementation_run_id ?? "none"}`,
    `Verification verdict: ${state.verification?.verdict ?? "missing"}`,
    `Pending reviewers: ${state.pending_reviewers.length > 0 ? state.pending_reviewers.join(", ") : "none"}`,
    `Completion: ${state.completion ? "present" : "missing"}`,
  ].join("\n");
}
