/**
 * SUPER_CLAUDE — State Machine
 * Reads and writes STATE.md, determines next action.
 */

import { PATHS, type Phase, type ProjectState, type TDDSubPhase } from "./types.ts";
import {
  findNextMilestone,
  findNextSlice,
  findNextTask,
  isSliceComplete,
  isMilestoneComplete,
  discoverSlicesFromRoadmap,
  discoverTasksFromPlan,
} from "./milestone-manager.ts";
import { scaffoldSlice, scaffoldTask } from "./scaffold.ts";
import { isDiscussNeeded, isResearchNeeded, isPhaseArtifactComplete } from "./phase-handlers.ts";
import { shouldSkipPhase, type PressurePolicy } from "./budget-pressure.ts";

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
  /** Discovered milestone ID — applied to state by computeNextState() */
  milestone?: string | null;
  /** Discovered slice ID — applied to state by computeNextState() */
  slice?: string | null;
  /** Discovered task ID — applied to state by computeNextState() */
  task?: string | null;
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

/**
 * Enhanced next action that integrates multi-milestone support and budget pressure.
 * Falls through phases intelligently: IDLE → DISCUSS → RESEARCH → PLAN → EXECUTE → COMPLETE.
 */
export async function determineNextActionEnhanced(
  projectRoot: string,
  state: ProjectState,
  pressure: PressurePolicy | null
): Promise<NextAction> {
  switch (state.phase) {
    case "IDLE":
      return await handleIdleEnhanced(projectRoot, state, pressure);

    case "DISCUSS":
      // Check if discuss has produced its artifact
      if (state.currentMilestone) {
        const complete = await isPhaseArtifactComplete(projectRoot, "DISCUSS", state.currentMilestone);
        if (complete) {
          // Move to RESEARCH or skip it
          if (pressure && shouldSkipPhase("RESEARCH", pressure)) {
            return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "Skip research (budget pressure) — plan milestone" };
          }
          return { phase: "RESEARCH", tddSubPhase: null, description: "Discuss complete — start research" };
        }
      }
      return { phase: "DISCUSS", tddSubPhase: null, description: "Continue discuss phase" };

    case "RESEARCH":
      if (state.currentMilestone) {
        const complete = await isPhaseArtifactComplete(projectRoot, "RESEARCH", state.currentMilestone);
        if (complete) {
          return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "Research complete — plan milestone" };
        }
      }
      return { phase: "RESEARCH", tddSubPhase: null, description: "Continue research phase" };

    case "PLAN_MILESTONE":
      if (state.currentMilestone) {
        const complete = await isPhaseArtifactComplete(projectRoot, "PLAN_MILESTONE", state.currentMilestone);
        if (complete) {
          // Find first slice to plan
          let nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
          if (!nextSlice) {
            // No slice directories yet — scaffold them from ROADMAP.md
            const roadmapSlices = await discoverSlicesFromRoadmap(projectRoot, state.currentMilestone);
            for (const s of roadmapSlices) {
              await scaffoldSlice(projectRoot, state.currentMilestone, s.id, s.demoSentence);
            }
            // Retry finding a slice now that directories exist
            nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
          }
          if (nextSlice) {
            return { phase: "PLAN_SLICE", tddSubPhase: null, description: `Milestone planned — plan slice ${nextSlice}`, slice: nextSlice };
          }
        }
      }
      return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "Plan milestone" };

    case "PLAN_SLICE": {
      // Check if slice plan is filled (not template) and scaffold task dirs
      const planSliceId = state.currentSlice;
      if (state.currentMilestone && planSliceId) {
        const planPath = `${projectRoot}/${PATHS.slicePath(state.currentMilestone, planSliceId)}/PLAN.md`;
        const planFile = Bun.file(planPath);
        if (await planFile.exists()) {
          const planContent = await planFile.text();
          if (!planContent.includes("_To be planned during PLAN_SLICE phase._")) {
            // Plan is filled — find or scaffold tasks
            let nextTask = await findNextTask(projectRoot, state.currentMilestone, planSliceId);
            if (!nextTask) {
              const planTasks = await discoverTasksFromPlan(projectRoot, state.currentMilestone, planSliceId);
              for (const t of planTasks) {
                await scaffoldTask(projectRoot, state.currentMilestone, planSliceId, t.id, t.goal);
              }
              nextTask = await findNextTask(projectRoot, state.currentMilestone, planSliceId);
            }
            if (nextTask) {
              return {
                phase: "EXECUTE_TASK",
                tddSubPhase: "RED",
                description: `Slice planned — execute ${planSliceId}/${nextTask}`,
                slice: planSliceId,
                task: nextTask,
              };
            }
          }
        }
      }
      return { phase: "PLAN_SLICE", tddSubPhase: null, description: "Plan slice" };
    }

    case "EXECUTE_TASK":
      return handleExecuteTask(state);

    case "COMPLETE_SLICE":
      return await handleCompleteSliceEnhanced(projectRoot, state, pressure);

    case "REASSESS":
      return await handleReassessEnhanced(projectRoot, state);

    case "COMPLETE_MILESTONE":
      return { phase: "COMPLETE_MILESTONE", tddSubPhase: null, description: "Complete milestone" };

    default:
      return { phase: "IDLE", tddSubPhase: null, description: "Unknown state — reset to IDLE" };
  }
}

async function handleIdleEnhanced(
  projectRoot: string,
  state: ProjectState,
  pressure: PressurePolicy | null
): Promise<NextAction> {
  // If a milestone is set, navigate into it
  if (state.currentMilestone) {
    // Check if milestone is fully complete
    const milestoneComplete = await isMilestoneComplete(projectRoot, state.currentMilestone);
    if (milestoneComplete) {
      return { phase: "COMPLETE_MILESTONE", tddSubPhase: null, description: `Milestone ${state.currentMilestone} complete — finalize` };
    }

    // Check for roadmap first — if it exists and is filled, skip discuss/research
    const roadmapPath = `${projectRoot}/${PATHS.milestonePath(state.currentMilestone)}/ROADMAP.md`;
    const roadmapFile = Bun.file(roadmapPath);
    const hasRoadmap = await roadmapFile.exists();
    const roadmapIsComplete = hasRoadmap
      && !(await roadmapFile.text()).includes("_To be planned during PLAN_MILESTONE phase._");

    if (!roadmapIsComplete) {
      // Only check discuss/research if we haven't planned the milestone yet
      if (await isDiscussNeeded(projectRoot, state.currentMilestone)) {
        if (pressure && shouldSkipPhase("DISCUSS", pressure)) {
          // Skip discuss due to budget pressure
        } else {
          return { phase: "DISCUSS", tddSubPhase: null, description: "No context — start discuss phase" };
        }
      }

      if (await isResearchNeeded(projectRoot, state.currentMilestone)) {
        if (pressure && shouldSkipPhase("RESEARCH", pressure)) {
          // Skip research due to budget pressure
        } else {
          return { phase: "RESEARCH", tddSubPhase: null, description: "No research — start research phase" };
        }
      }

      // No roadmap or roadmap is placeholder — need to plan
      return { phase: "PLAN_MILESTONE", tddSubPhase: null, description: "No roadmap — plan milestone" };
    }

    // Find next slice to work on — scaffold from ROADMAP if no slice dirs exist yet
    let nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
    if (!nextSlice) {
      const roadmapSlices = await discoverSlicesFromRoadmap(projectRoot, state.currentMilestone);
      for (const s of roadmapSlices) {
        await scaffoldSlice(projectRoot, state.currentMilestone, s.id, s.demoSentence);
      }
      nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
    }
    if (nextSlice) {
      // Find next task in this slice
      const nextTask = await findNextTask(projectRoot, state.currentMilestone, nextSlice);
      if (nextTask) {
        return {
          phase: "EXECUTE_TASK",
          tddSubPhase: "RED",
          description: `Execute ${nextSlice}/${nextTask}`,
          slice: nextSlice,
          task: nextTask,
        };
      }
      // Slice has no pending tasks — might need planning
      return { phase: "PLAN_SLICE", tddSubPhase: null, description: `Plan slice ${nextSlice}`, slice: nextSlice };
    }
  }

  // No milestone set — try to find one
  const nextMilestone = await findNextMilestone(projectRoot);
  if (nextMilestone) {
    return { phase: "IDLE", tddSubPhase: null, description: `Found milestone ${nextMilestone} — set it as current to begin`, milestone: nextMilestone };
  }

  return { phase: "IDLE", tddSubPhase: null, description: "No work to do — waiting for instructions" };
}

async function handleCompleteSliceEnhanced(
  projectRoot: string,
  state: ProjectState,
  pressure: PressurePolicy | null
): Promise<NextAction> {
  if (!state.currentMilestone) {
    return { phase: "IDLE", tddSubPhase: null, description: "No milestone — return to IDLE" };
  }

  // After slice completion, reassess (unless budget pressure says skip)
  if (pressure && shouldSkipPhase("REASSESS", pressure)) {
    // Skip reassess — go directly to next slice
    const nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
    if (nextSlice) {
      return { phase: "PLAN_SLICE", tddSubPhase: null, description: `Skip reassess — plan next slice ${nextSlice}`, slice: nextSlice, task: null };
    }
    return { phase: "COMPLETE_MILESTONE", tddSubPhase: null, description: "All slices done — complete milestone" };
  }

  return { phase: "REASSESS", tddSubPhase: null, description: "Slice complete — reassess roadmap" };
}

async function handleReassessEnhanced(
  projectRoot: string,
  state: ProjectState
): Promise<NextAction> {
  if (!state.currentMilestone) {
    return { phase: "IDLE", tddSubPhase: null, description: "No milestone — return to IDLE" };
  }

  // After reassess, find next slice
  const nextSlice = await findNextSlice(projectRoot, state.currentMilestone);
  if (nextSlice) {
    return { phase: "PLAN_SLICE", tddSubPhase: null, description: `Reassess complete — plan next slice ${nextSlice}`, slice: nextSlice, task: null };
  }

  // All slices done
  return { phase: "COMPLETE_MILESTONE", tddSubPhase: null, description: "All slices complete — finalize milestone" };
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
