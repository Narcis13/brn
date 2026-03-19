export const AUDIT_FINDING_SEVERITIES = ["info", "warn", "error"] as const;
export type AuditFindingSeverity = (typeof AUDIT_FINDING_SEVERITIES)[number];

export const AUDIT_VERDICTS = ["pass", "fail"] as const;
export type AuditVerdict = (typeof AUDIT_VERDICTS)[number];

export const AUDIT_TRIGGERS = ["manual", "slice_complete", "recovery_resume"] as const;
export type AuditTrigger = (typeof AUDIT_TRIGGERS)[number];

export const POSTMORTEM_TRIGGERS = ["manual", "retry_exhausted", "recovery_replan"] as const;
export type PostmortemTrigger = (typeof POSTMORTEM_TRIGGERS)[number];

export interface AuditFinding {
  severity: AuditFindingSeverity;
  code: string;
  message: string;
  ref: string | null;
}

export interface MemoryAuditReport {
  version: number;
  unit_id: string;
  unit_type: string;
  trigger: AuditTrigger;
  verdict: AuditVerdict;
  summary: string;
  findings: AuditFinding[];
  refs: string[];
  generated_at: string;
}

export interface PostmortemReport {
  version: number;
  run_id: string;
  unit_id: string | null;
  trigger: PostmortemTrigger;
  summary: string;
  findings: AuditFinding[];
  followups: string[];
  evidence_refs: string[];
  generated_at: string;
}
