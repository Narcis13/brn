/**
 * SUPER_CLAUDE — State Machine
 * Reads and writes STATE.md, determines next action.
 */

import { PATHS, type Phase, type ProjectState, type TDDSubPhase } from "./types.ts";

const STATE_PATH = PATHS.stateFile;

// ─── Default State ───────────────────────────────────────────────

const DEFAULT_STATE: ProjectState = {
  phase: "IDLE",
  tddSubPhase: null,
  currentMilestone: null,
  currentSlice: null,
  currentTask: null,
  lastUpdated: new Date().toISOString(),
};

// ─── Frontmatter Parsing ─────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

function toFrontmatter(data: Record<string, string | null>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${value ?? "null"}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// ─── Read State ──────────────────────────────────────────────────

export async function readState(projectRoot: string): Promise<ProjectState> {
  const path = `${projectRoot}/${STATE_PATH}`;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return { ...DEFAULT_STATE };
  }

  const content = await file.text();
  const fm = parseFrontmatter(content);

  return {
    phase: (fm["phase"] as Phase) ?? "IDLE",
    tddSubPhase: fm["tdd_sub_phase"] === "null" || !fm["tdd_sub_phase"]
      ? null
      : (fm["tdd_sub_phase"] as TDDSubPhase),
    currentMilestone: fm["milestone"] === "null" ? null : (fm["milestone"] ?? null),
    currentSlice: fm["slice"] === "null" ? null : (fm["slice"] ?? null),
    currentTask: fm["task"] === "null" ? null : (fm["task"] ?? null),
    lastUpdated: fm["last_updated"] ?? new Date().toISOString(),
  };
}

// ─── Write State ─────────────────────────────────────────────────

export async function writeState(projectRoot: string, state: ProjectState): Promise<void> {
  const path = `${projectRoot}/${STATE_PATH}`;

  const fm = toFrontmatter({
    phase: state.phase,
    tdd_sub_phase: state.tddSubPhase,
    milestone: state.currentMilestone,
    slice: state.currentSlice,
    task: state.currentTask,
    last_updated: new Date().toISOString(),
  });

  const body = `\n## Current Position\n\n- **Phase:** ${state.phase}\n- **Milestone:** ${state.currentMilestone ?? "none"}\n- **Slice:** ${state.currentSlice ?? "none"}\n- **Task:** ${state.currentTask ?? "none"}\n- **TDD Sub-Phase:** ${state.tddSubPhase ?? "n/a"}\n`;

  await Bun.write(path, fm + "\n" + body);
}

// ─── Next Action ─────────────────────────────────────────────────

export interface NextAction {
  phase: Phase;
  tddSubPhase: TDDSubPhase | null;
  description: string;
}

/**
 * Determine the next action based on current state and what exists on disk.
 * This is the core state machine transition logic.
 */
export async function determineNextAction(
  projectRoot: string,
  state: ProjectState
): Promise<NextAction> {
  switch (state.phase) {
    case "IDLE":
      return await handleIdle(projectRoot, state);
    case "DISCUSS":
      return { phase: "DISCUSS", tddSubPhase: null, description: "Continue discuss phase" };
    case "RESEARCH":
      return { phase: "RESEARCH", tddSubPhase: null, description: "Continue research phase" };
    case "PLAN_MILESTONE":
      return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "Plan milestone" };
    case "PLAN_SLICE":
      return { phase: "PLAN_SLICE", tddSubPhase: null, description: "Plan slice" };
    case "EXECUTE_TASK":
      return handleExecuteTask(state);
    case "COMPLETE_SLICE":
      return { phase: "COMPLETE_SLICE", tddSubPhase: null, description: "Complete slice" };
    case "REASSESS":
      return { phase: "REASSESS", tddSubPhase: null, description: "Reassess roadmap" };
    case "COMPLETE_MILESTONE":
      return { phase: "COMPLETE_MILESTONE", tddSubPhase: null, description: "Complete milestone" };
    default:
      return { phase: "IDLE", tddSubPhase: null, description: "Unknown state — reset to IDLE" };
  }
}

async function handleIdle(projectRoot: string, state: ProjectState): Promise<NextAction> {
  // Check if there's a milestone set but no CONTEXT.md → need DISCUSS
  if (state.currentMilestone) {
    const contextPath = `${projectRoot}/${PATHS.milestonePath(state.currentMilestone)}/CONTEXT.md`;
    const contextExists = await Bun.file(contextPath).exists();
    if (!contextExists) {
      return { phase: "DISCUSS", tddSubPhase: null, description: "No context — start discuss phase" };
    }

    // Check if there's a ROADMAP.md → need PLAN_MILESTONE
    const roadmapPath = `${projectRoot}/${PATHS.milestonePath(state.currentMilestone)}/ROADMAP.md`;
    const roadmapExists = await Bun.file(roadmapPath).exists();
    if (!roadmapExists) {
      return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "No roadmap — plan milestone" };
    }
  }

  // Check for ready specs
  const specsDir = `${projectRoot}/${PATHS.specs}`;
  const specsExist = await Bun.file(specsDir).exists();
  if (specsExist) {
    // Look for ready specs (non-draft)
    // For now, return IDLE — the human or a command starts a milestone
  }

  return { phase: "IDLE", tddSubPhase: null, description: "No work to do — waiting for instructions" };
}

function handleExecuteTask(state: ProjectState): NextAction {
  const subPhase = state.tddSubPhase;
  switch (subPhase) {
    case null:
    case "RED":
      return { phase: "EXECUTE_TASK", tddSubPhase: "RED", description: "Write failing tests" };
    case "GREEN":
      return { phase: "EXECUTE_TASK", tddSubPhase: "GREEN", description: "Implement to pass tests" };
    case "REFACTOR":
      return { phase: "EXECUTE_TASK", tddSubPhase: "REFACTOR", description: "Refactor implementation" };
    case "VERIFY":
      return { phase: "EXECUTE_TASK", tddSubPhase: "VERIFY", description: "Run comprehensive verification" };
    default:
      return { phase: "EXECUTE_TASK", tddSubPhase: "RED", description: "Unknown TDD sub-phase — start RED" };
  }
}

// ─── Transition Helpers ──────────────────────────────────────────

export function advanceTDDPhase(current: TDDSubPhase | null): TDDSubPhase | null {
  switch (current) {
    case null:
    case "RED":
      return "GREEN";
    case "GREEN":
      return "REFACTOR";
    case "REFACTOR":
      return "VERIFY";
    case "VERIFY":
      return null; // Task complete
  }
}

export function advancePhase(current: Phase): Phase {
  const transitions: Record<Phase, Phase> = {
    IDLE: "DISCUSS",
    DISCUSS: "RESEARCH",
    RESEARCH: "PLAN_MILESTONE",
    PLAN_MILESTONE: "PLAN_SLICE",
    PLAN_SLICE: "EXECUTE_TASK",
    EXECUTE_TASK: "COMPLETE_SLICE",
    COMPLETE_SLICE: "REASSESS",
    REASSESS: "PLAN_SLICE",
    COMPLETE_MILESTONE: "IDLE",
  };
  return transitions[current];
}
