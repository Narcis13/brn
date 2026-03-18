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
  | "REASSESS"
  | "COMPLETE_MILESTONE";

export type TDDSubPhase = "RED" | "GREEN" | "REFACTOR" | "VERIFY";

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

  stateFile: ".superclaude/state/STATE.md",
  projectFile: ".superclaude/state/PROJECT.md",
  decisionsFile: ".superclaude/state/DECISIONS.md",
  lockFile: ".superclaude/state/auto.lock",

  vaultIndex: ".superclaude/vault/INDEX.md",

  milestonePath: (m: string) => `.superclaude/state/milestones/${m}`,
  slicePath: (m: string, s: string) => `.superclaude/state/milestones/${m}/slices/${s}`,
  taskPath: (m: string, s: string, t: string) =>
    `.superclaude/state/milestones/${m}/slices/${s}/tasks/${t}`,
} as const;
