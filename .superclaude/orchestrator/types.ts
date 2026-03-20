/**
 * SUPER_CLAUDE — Shared Types
 * All state structures, enums, and interfaces for the orchestrator.
 */

// ─── State Machine ───────────────────────────────────────────────

export type Phase =
  | "IDLE"
  | "DISCUSS"
  | "RESEARCH"
  | "PLAN_MILESTONE"
  | "PLAN_SLICE"
  | "EXECUTE_TASK"
  | "COMPLETE_SLICE"
  | "RETROSPECTIVE"
  | "REASSESS"
  | "COMPLETE_MILESTONE";

export type TDDSubPhase = "IMPLEMENT";

export type TaskStatus = "pending" | "in_progress" | "complete" | "failed" | "blocked";
export type SliceStatus = "pending" | "in_progress" | "complete" | "failed";
export type MilestoneStatus = "pending" | "in_progress" | "complete";

// ─── State on Disk ───────────────────────────────────────────────

export interface ProjectState {
  phase: Phase;
  tddSubPhase: TDDSubPhase | null;
  currentMilestone: string | null; // e.g. "M001"
  currentSlice: string | null;     // e.g. "S01"
  currentTask: string | null;      // e.g. "T01"
  lastUpdated: string;             // ISO timestamp
}

export interface TaskPlan {
  task: string;
  slice: string;
  milestone: string;
  status: TaskStatus;
  goal: string;
  steps: string[];
  mustHaves: MustHaves;
  mustNotHaves: string[];
  tddSequence: TDDSequence;
}

export interface MustHaves {
  truths: string[];
  artifacts: ArtifactSpec[];
  keyLinks: string[];
}

export interface ArtifactSpec {
  path: string;
  description: string;
  minLines: number;
  requiredExports: string[];
}

export interface TDDSequence {
  testFiles: string[];
  testCases: string[];
  implementationFiles: string[];
}

// ─── Slice & Milestone ───────────────────────────────────────────

export interface SlicePlan {
  slice: string;
  milestone: string;
  status: SliceStatus;
  demoSentence: string;
  tasks: string[];       // Task IDs in order
  boundaryMap: BoundaryMap;
}

export interface BoundaryMap {
  produces: BoundaryItem[];
  consumes: BoundaryItem[];
}

export interface BoundaryItem {
  file: string;
  exports: string[];
}

export interface MilestoneRoadmap {
  milestone: string;
  status: MilestoneStatus;
  description: string;
  slices: SliceEntry[];
}

export interface SliceEntry {
  id: string;
  demoSentence: string;
  dependsOn: string[];
  risk: "low" | "medium" | "high";
  status: SliceStatus;
}

// ─── Task Summary ────────────────────────────────────────────────

export interface TaskSummary {
  task: string;
  status: "complete" | "failed";
  filesModified: string[];
  patternsEstablished: string[];
  whatWasBuilt: string;
  keyDecisions: Record<string, string>;
  downstreamNotes: string[];
}

export interface SliceSummary {
  slice: string;
  status: "complete" | "failed";
  tasksCompleted: string[];
  demoSentence: string;
  whatWasBuilt: string;
  interfacesProduced: string[];
  patternsEstablished: string[];
  knownLimitations: string[];
}

// ─── Continue-Here Protocol ──────────────────────────────────────

export interface ContinueHere {
  task: string;
  interruptedAt: TDDSubPhase;
  whatsDone: string[];
  whatRemains: string[];
  decisionsMade: string[];
  watchOutFor: string[];
  firstThingToDo: string;
}

// ─── Verification ────────────────────────────────────────────────

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
}

export interface VerificationCheck {
  name: string;
  type: "static" | "command" | "behavioral";
  passed: boolean;
  message: string;
}

// ─── Context Assembly ────────────────────────────────────────────

export interface ContextBudget {
  systemInstructions: number;  // tokens
  taskPlan: number;
  codeFiles: number;
  upstreamSummaries: number;
  vaultDocs: number;
  boundaryContracts: number;
  total: number;
}

export interface ContextPayload {
  taskPlan: string;
  codeFiles: Record<string, string>;  // path → content
  upstreamSummaries: string[];
  vaultDocs: string[];
  boundaryContracts: string[];
}

// ─── Cost Tracking ───────────────────────────────────────────────

export interface CostEntry {
  phase: Phase;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  timestamp: string;
}

export interface SessionReport {
  session: string;
  started: string;
  ended: string;
  status: "completed" | "budget_exceeded" | "error";
  tasksCompleted: string[];
  issuesEncountered: string[];
  blockedItems: string[];
  totalCost: number;
}

// ─── Sub-Agent System ───────────────────────────────────────────

export type AgentRole =
  | "architect"
  | "implementer"
  | "tester"
  | "reviewer"
  | "researcher"
  | "doctor"
  | "scribe"
  | "evolver";

export type ReviewPersona =
  | "correctness"
  | "architecture"
  | "typescript"
  | "performance"
  | "security"
  | "testability";

export type ReviewSeverity = "MUST-FIX" | "SHOULD-FIX" | "CONSIDER";

export interface ReviewIssue {
  persona: ReviewPersona;
  severity: ReviewSeverity;
  description: string;
  file: string | null;
  line: number | null;
  suggestion: string | null;
}

export interface ReviewResult {
  persona: ReviewPersona;
  issues: ReviewIssue[];
  summary: string;
}

export interface AgentDefinition {
  role: AgentRole;
  skillPath: string;
  vaultAccess: string[];
  description: string;
}

export interface AgentInvocation {
  agent: AgentRole;
  prompt: string;
  scopeGuard: string[];
  tokenBudget: number;
}

export interface AgentOutput {
  agent: AgentRole;
  success: boolean;
  content: string;
  issues: ReviewIssue[];
}

export const AGENT_DEFINITIONS: Record<AgentRole, AgentDefinition> = {
  architect: {
    role: "architect",
    skillPath: ".superclaude/skills/architect/SKILL.md",
    vaultAccess: ["architecture/", "decisions/", "contracts/", "patterns/"],
    description: "System design, interface contracts, boundary maps",
  },
  implementer: {
    role: "implementer",
    skillPath: ".superclaude/skills/implementer/SKILL.md",
    vaultAccess: ["patterns/", "testing/", "contracts/"],
    description: "TDD code writing — the main workhorse",
  },
  tester: {
    role: "tester",
    skillPath: ".superclaude/skills/tester/SKILL.md",
    vaultAccess: ["testing/", "patterns/"],
    description: "Test strategy, test writing, coverage analysis, UAT generation",
  },
  reviewer: {
    role: "reviewer",
    skillPath: ".superclaude/skills/reviewer/SKILL.md",
    vaultAccess: ["patterns/", "architecture/", "decisions/", "learnings/"],
    description: "Code review from 6 personas: correctness, architecture, typescript, performance, security, testability",
  },
  researcher: {
    role: "researcher",
    skillPath: ".superclaude/skills/researcher/SKILL.md",
    vaultAccess: ["architecture/"],
    description: "Codebase scouting, library docs, web research",
  },
  doctor: {
    role: "doctor",
    skillPath: ".superclaude/skills/doctor/SKILL.md",
    vaultAccess: ["learnings/", "patterns/", "architecture/"],
    description: "Debugging, error diagnosis, failure analysis",
  },
  scribe: {
    role: "scribe",
    skillPath: ".superclaude/skills/scribe/SKILL.md",
    vaultAccess: ["architecture/", "patterns/", "decisions/", "learnings/", "playbooks/", "contracts/", "testing/"],
    description: "Documentation, summaries, changelogs, ADRs",
  },
  evolver: {
    role: "evolver",
    skillPath: ".superclaude/skills/evolver/SKILL.md",
    vaultAccess: ["architecture/", "patterns/", "decisions/", "learnings/", "playbooks/", "contracts/", "testing/"],
    description: "System self-improvement — the meta-agent",
  },
};

export const REVIEW_PERSONAS: ReviewPersona[] = [
  "correctness",
  "architecture",
  "typescript",
  "performance",
  "security",
  "testability",
];

// ─── Postmortem Protocol ─────────────────────────────────────────

export type PostmortemFrequency = "rare" | "occasional" | "frequent";
export type PostmortemImpact = "minor" | "moderate" | "severe";
export type PostmortemEffort = "trivial" | "moderate" | "significant";
export type PostmortemRecommendation = "fix-now" | "fix-soon" | "defer";

export interface PostmortemFailure {
  what: string;
  when: string;       // task/slice/phase identifier
  impact: string;
}

export interface PostmortemRootCause {
  contextPresent: string[];
  contextMissing: string[];
  unclearDoc: string | null;
  ambiguousSkill: string | null;
  missingTest: string | null;
  missingVerification: string | null;
}

export interface PostmortemFix {
  type: "vault-doc" | "skill-instruction" | "test-pattern" | "verification-check";
  target: string;      // file path or identifier
  description: string;
  before: string | null;
  after: string | null;
  reason: string;
}

export interface PostmortemSeverity {
  frequency: PostmortemFrequency;
  impact: PostmortemImpact;
  effort: PostmortemEffort;
  recommendation: PostmortemRecommendation;
}

export interface PostmortemReport {
  id: string;                // e.g. "PM-001"
  timestamp: string;         // ISO
  session: string;           // session that triggered it
  failure: PostmortemFailure;
  rootCause: PostmortemRootCause;
  proposedFixes: PostmortemFix[];
  severity: PostmortemSeverity;
  status: "proposed" | "approved" | "applied" | "rejected";
}

// ─── Metrics & Trend Analysis ───────────────────────────────────

export interface SessionMetrics {
  session: string;
  timestamp: string;
  tasksAttempted: number;
  tasksCompleted: number;
  tasksFailed: number;
  testsWritten: number;
  testsPassing: number;
  testsFailing: number;
  reviewIssues: Record<ReviewSeverity, number>;
  postmortemsGenerated: number;
  tokenUsage: Record<string, number>;  // phase → tokens
  costPerPhase: Record<string, number>;
  totalCost: number;
  timePerTask: Record<string, number>; // task → ms
}

export type TrendDirection = "improving" | "stable" | "degrading";

export interface TrendPoint {
  session: string;
  value: number;
}

export interface TrendAnalysis {
  metric: string;
  direction: TrendDirection;
  current: number;
  previous: number;
  percentChange: number;
  dataPoints: TrendPoint[];
}

export interface MetricsSummary {
  sessions: number;
  latestSession: string;
  trends: TrendAnalysis[];
  compoundingScore: number;  // 0-100, are things getting better?
}

// ─── Evolver Proposals ──────────────────────────────────────────

export type ProposalStatus = "pending" | "approved" | "applied" | "rejected";

export interface EvolverProposal {
  id: string;                // e.g. "EVO-001"
  postmortemId: string;      // linked postmortem
  timestamp: string;
  fix: PostmortemFix;
  status: ProposalStatus;
  reviewNotes: string | null;
  appliedAt: string | null;
}

export interface EvolverResult {
  proposalsGenerated: number;
  proposalsApplied: number;
  vaultDocsUpdated: string[];
  skillsUpdated: string[];
  newLearnings: string[];
}

// ─── Constants ──────────────────────────────────────────────────

/** Maximum review retry attempts before allowing advancement with unresolved issues. */
export const MAX_REVIEW_RETRIES = 2;

// ─── Orchestrator Config ─────────────────────────────────────────

export interface OrchestratorConfig {
  mode: "auto" | "step" | "interactive";
  budgetCeiling: number;       // dollars
  milestone: string | null;    // specific milestone or null for next
  timeouts: {
    soft: number;              // ms
    idle: number;
    hard: number;
  };
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  mode: "interactive",
  budgetCeiling: 25.0,
  milestone: null,
  timeouts: {
    soft: 15 * 60 * 1000,     // 15 min
    idle: 10 * 60 * 1000,     // 10 min
    hard: 30 * 60 * 1000,     // 30 min
  },
};

// ─── Paths ───────────────────────────────────────────────────────

export const PATHS = {
  root: ".superclaude",
  orchestrator: ".superclaude/orchestrator",
  skills: ".superclaude/skills",
  vault: ".superclaude/vault",
  state: ".superclaude/state",
  specs: ".superclaude/specs",
  history: ".superclaude/history",

  stateFile: ".superclaude/state/state.json",
  projectFile: ".superclaude/state/PROJECT.md",
  decisionsFile: ".superclaude/state/DECISIONS.md",
  lockFile: ".superclaude/state/auto.lock",

  vaultIndex: ".superclaude/vault/INDEX.md",

  milestonePath: (m: string) => `.superclaude/state/milestones/${m}`,
  slicePath: (m: string, s: string) => `.superclaude/state/milestones/${m}/slices/${s}`,
  taskPath: (m: string, s: string, t: string) =>
    `.superclaude/state/milestones/${m}/slices/${s}/tasks/${t}`,
} as const;
