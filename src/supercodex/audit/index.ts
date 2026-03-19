import { fileExists, readJsonFile, readTextIfExists, writeJsonFile } from "../fs.js";
import { createProcessImprovementReport, recordLearningError } from "../learning/index.js";
import {
  listSliceIds,
  listTaskIds,
  loadTaskArtifact,
  parseUnitId,
} from "../planning/index.js";
import { resolveRepoPath } from "../paths.js";
import { loadCurrentState, loadQueueState, saveCurrentState } from "../state.js";
import { getCanonicalRunPaths, loadCanonicalRunRecord } from "../synth/runs.js";
import { getTaskVerificationPaths, getTaskVerificationState, verificationDoctorIssues } from "../verify/index.js";
import { validateMemoryAuditReport, validatePostmortemReport } from "./schemas.js";
import type { AuditFinding, AuditFindingSeverity, AuditTrigger, MemoryAuditReport, PostmortemReport, PostmortemTrigger } from "./types.js";

function slugify(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function finding(severity: AuditFindingSeverity, code: string, message: string, ref: string | null = null): AuditFinding {
  return {
    severity,
    code,
    message,
    ref,
  };
}

function appendMetric(root: string, field: "memory_audits" | "postmortems_generated"): void {
  const current = loadCurrentState(root);
  saveCurrentState(root, {
    ...current,
    metrics: {
      ...current.metrics,
      [field]: current.metrics[field] + 1,
    },
  });
}

function memoryAuditRef(unitId: string): string {
  return `.supercodex/audits/memory/${slugify(unitId)}.json`;
}

function postmortemRef(runId: string): string {
  return `.supercodex/audits/postmortems/${runId}.json`;
}

function taskFileRef(unitId: string): string {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id || !parsed.task_id) {
    throw new Error(`Task file ref requires a task unit id, received ${unitId}.`);
  }

  return `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/tasks/${parsed.task_id}.md`;
}

function sliceSummaryRef(unitId: string): string {
  const parsed = parseUnitId(unitId);
  if (!parsed.milestone_id || !parsed.slice_id) {
    throw new Error(`Slice summary ref requires a slice-like unit id, received ${unitId}.`);
  }

  return `vault/milestones/${parsed.milestone_id}/slices/${parsed.slice_id}/summary.md`;
}

function milestoneSummaryRef(unitId: string): string {
  const parsed = parseUnitId(unitId);
  if (!parsed.milestone_id) {
    throw new Error(`Milestone summary ref requires a milestone unit id, received ${unitId}.`);
  }

  return `vault/milestones/${parsed.milestone_id}/summary.md`;
}

function auditTask(root: string, unitId: string, findings: AuditFinding[], refs: string[]): void {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id || !parsed.task_id) {
    findings.push(finding("error", "unsupported_task_unit", `Memory audit requires a task unit id, received ${unitId}.`));
    return;
  }

  refs.push(taskFileRef(unitId), sliceSummaryRef(unitId));

  try {
    const artifact = loadTaskArtifact(root, parsed.milestone_id, parsed.slice_id, parsed.task_id);
    const verificationState = getTaskVerificationState(root, unitId);
    const queueItem = loadQueueState(root).items.find((item) => item.unit_id === unitId) ?? null;
    const verificationPaths = getTaskVerificationPaths(unitId);
    refs.push(verificationPaths.verification_ref, verificationPaths.completion_ref);

    if (verificationState.completion) {
      if (!/complete/i.test(artifact.status)) {
        findings.push(finding("error", "task_status_stale", `Task ${unitId} is completed on disk but its status is still "${artifact.status}".`, taskFileRef(unitId)));
      }
      if (/^pending\.?$/i.test(artifact.summary) || !/complete/i.test(artifact.summary)) {
        findings.push(finding("error", "task_summary_stale", `Task ${unitId} still carries a placeholder or non-complete summary.`, taskFileRef(unitId)));
      }
      for (const issue of verificationDoctorIssues(root, unitId)) {
        findings.push(finding("error", "verification_integrity", issue, verificationPaths.completion_ref));
      }
    } else {
      if (/complete/i.test(artifact.status)) {
        findings.push(finding("error", "task_marked_complete_without_completion", `Task ${unitId} is marked complete without a completion record.`, taskFileRef(unitId)));
      }
      if (queueItem?.status === "done") {
        findings.push(finding("error", "queue_done_without_completion", `Queue marks ${unitId} done without a completion record.`, ".supercodex/state/queue.json"));
      }
    }
  } catch (error) {
    findings.push(finding("error", "task_artifact_invalid", error instanceof Error ? error.message : String(error), taskFileRef(unitId)));
  }
}

function auditSlice(root: string, unitId: string, findings: AuditFinding[], refs: string[]): void {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "slice" || !parsed.milestone_id || !parsed.slice_id) {
    findings.push(finding("error", "unsupported_slice_unit", `Memory audit requires a slice unit id, received ${unitId}.`));
    return;
  }

  const summaryRef = sliceSummaryRef(unitId);
  refs.push(summaryRef);
  const summary = readTextIfExists(resolveRepoPath(root, summaryRef)) ?? "";
  const taskIds = listTaskIds(root, parsed.milestone_id, parsed.slice_id);

  if (taskIds.length === 0) {
    findings.push(finding("warn", "slice_has_no_tasks", `Slice ${unitId} has no task files to audit.`, summaryRef));
    return;
  }

  const allComplete = taskIds.every((taskId) => getTaskVerificationState(root, `${parsed.milestone_id}/${parsed.slice_id}/${taskId}`).completion);
  const markedComplete = /Status:\s*complete/i.test(summary);

  if (allComplete && !markedComplete) {
    findings.push(finding("error", "slice_summary_stale", `Slice ${unitId} summary does not report complete even though all tasks are complete.`, summaryRef));
  }
  if (!allComplete && markedComplete) {
    findings.push(finding("error", "slice_summary_ahead_of_truth", `Slice ${unitId} summary claims complete before all tasks are complete.`, summaryRef));
  }
}

function auditMilestone(root: string, unitId: string, findings: AuditFinding[], refs: string[]): void {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "milestone" || !parsed.milestone_id) {
    findings.push(finding("error", "unsupported_milestone_unit", `Memory audit requires a milestone unit id, received ${unitId}.`));
    return;
  }

  const summaryRef = milestoneSummaryRef(unitId);
  refs.push(summaryRef);
  const summary = readTextIfExists(resolveRepoPath(root, summaryRef)) ?? "";
  const sliceIds = listSliceIds(root, parsed.milestone_id);

  if (sliceIds.length === 0) {
    findings.push(finding("warn", "milestone_has_no_slices", `Milestone ${unitId} has no slices to audit.`, summaryRef));
    return;
  }

  const allSliceSummariesComplete = sliceIds.every((sliceId) => {
    const sliceSummary = readTextIfExists(resolveRepoPath(root, `vault/milestones/${parsed.milestone_id}/slices/${sliceId}/summary.md`)) ?? "";
    return /Status:\s*complete/i.test(sliceSummary);
  });
  const milestoneMarkedComplete = /Status:\s*complete/i.test(summary);

  if (allSliceSummariesComplete && !milestoneMarkedComplete) {
    findings.push(finding("error", "milestone_summary_stale", `Milestone ${unitId} summary does not report complete even though all slice summaries are complete.`, summaryRef));
  }
  if (!allSliceSummariesComplete && milestoneMarkedComplete) {
    findings.push(finding("error", "milestone_summary_ahead_of_truth", `Milestone ${unitId} summary claims complete before all slices do.`, summaryRef));
  }
}

export function runMemoryAudit(root: string, unitId: string, trigger: AuditTrigger = "manual"): MemoryAuditReport {
  const parsed = parseUnitId(unitId);
  if (parsed.kind === "unknown") {
    throw new Error(`Unsupported audit unit id: ${unitId}`);
  }

  const findings: AuditFinding[] = [];
  const refs: string[] = [];

  if (parsed.kind === "task") {
    auditTask(root, unitId, findings, refs);
  } else if (parsed.kind === "slice") {
    auditSlice(root, unitId, findings, refs);
  } else if (parsed.kind === "milestone") {
    auditMilestone(root, unitId, findings, refs);
  } else {
    findings.push(finding("warn", "unsupported_unit_kind", `Memory audits currently support milestone, slice, and task units, not ${parsed.kind}.`));
  }

  const report: MemoryAuditReport = {
    version: 1,
    unit_id: unitId,
    unit_type: parsed.kind,
    trigger,
    verdict: findings.some((entry) => entry.severity === "error") ? "fail" : "pass",
    summary:
      findings.length === 0
        ? `Memory audit passed for ${unitId}.`
        : `Memory audit found ${findings.length} issue${findings.length === 1 ? "" : "s"} for ${unitId}.`,
    findings,
    refs: unique(refs),
    generated_at: new Date().toISOString(),
  };

  validateMemoryAuditReport(report);
  writeJsonFile(resolveRepoPath(root, memoryAuditRef(unitId)), report);
  appendMetric(root, "memory_audits");
  return report;
}

export function runPostmortem(root: string, runId: string, trigger: PostmortemTrigger = "manual"): PostmortemReport {
  const record = loadCanonicalRunRecord(root, runId);
  const paths = getCanonicalRunPaths(runId);
  const findings: AuditFinding[] = [];
  const evidenceRefs = [paths.record_ref, record.normalized_ref ?? "", record.continuation_ref];

  findings.push(finding(record.status === "failed" ? "error" : "warn", "run_status", `Run ${runId} ended with status ${record.status}.`, paths.record_ref));

  if (trigger === "retry_exhausted") {
    findings.push(finding("error", "retry_budget_exhausted", `Retry budget is exhausted for ${record.unit_id}.`, paths.record_ref));
  }
  if (trigger === "recovery_replan") {
    findings.push(finding("error", "recovery_replan", `Recovery reconciliation pushed ${record.unit_id} back to plan.`, paths.recovery_ref));
  }
  for (const blocker of record.blockers) {
    findings.push(finding("warn", "recorded_blocker", blocker, record.continuation_ref));
  }
  if (fileExists(resolveRepoPath(root, paths.recovery_ref))) {
    evidenceRefs.push(paths.recovery_ref);
  }

  const followups = unique([
    ...record.followups,
    "Inspect the canonical run record and continuation packet before creating another attempt.",
    trigger === "retry_exhausted" ? "Replan the unit or adjust the retry policy before continuing." : "",
    trigger === "recovery_replan" ? "Regenerate planning or verification artifacts before dispatching again." : "",
  ]);

  const report: PostmortemReport = {
    version: 1,
    run_id: runId,
    unit_id: record.unit_id,
    trigger,
    summary: `Postmortem generated for ${runId} (${record.unit_id}) after ${trigger}.`,
    findings,
    followups,
    evidence_refs: unique(evidenceRefs),
    generated_at: new Date().toISOString(),
  };

  validatePostmortemReport(report);
  writeJsonFile(resolveRepoPath(root, postmortemRef(runId)), report);
  appendMetric(root, "postmortems_generated");
  try {
    createProcessImprovementReport(root, runId);
  } catch (error) {
    recordLearningError(root, error instanceof Error ? error.message : String(error));
  }
  return report;
}
