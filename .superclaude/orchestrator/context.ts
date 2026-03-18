/**
 * SUPER_CLAUDE — Context Assembly Engine
 * Loads and assembles context for each phase, respecting token budgets.
 */

import { PATHS, type ContextPayload, type ProjectState } from "./types.ts";

// Rough token estimate: 1 token ≈ 4 chars
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Context Assembly ────────────────────────────────────────────

export async function assembleContext(
  projectRoot: string,
  state: ProjectState
): Promise<ContextPayload> {
  const payload: ContextPayload = {
    taskPlan: "",
    codeFiles: {},
    upstreamSummaries: [],
    vaultDocs: [],
    boundaryContracts: [],
  };

  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;

  switch (state.phase) {
    case "DISCUSS":
    case "PLAN_MILESTONE":
      if (m) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.milestonePath(m)}/ROADMAP.md`);
        const contextMd = await loadFile(projectRoot, `${PATHS.milestonePath(m)}/CONTEXT.md`);
        if (contextMd) payload.upstreamSummaries.push(contextMd);
      }
      break;

    case "RESEARCH":
      if (m) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.milestonePath(m)}/ROADMAP.md`);
      }
      break;

    case "PLAN_SLICE":
      if (m && s) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.slicePath(m, s)}/PLAN.md`);
        payload.upstreamSummaries = await loadUpstreamSliceSummaries(projectRoot, m, s);
        payload.boundaryContracts = await loadBoundaryContracts(projectRoot, m);
      }
      break;

    case "EXECUTE_TASK":
      if (m && s && t) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.taskPath(m, s, t)}/PLAN.md`);

        // Load continue-here if it exists
        const continueHere = await loadFile(
          projectRoot,
          `${PATHS.taskPath(m, s, t)}/CONTINUE.md`
        );
        if (continueHere) {
          payload.taskPlan += "\n\n## Continue From\n" + continueHere;
        }

        // Load upstream task summaries from same slice
        payload.upstreamSummaries = await loadUpstreamTaskSummaries(projectRoot, m, s, t);

        // Load relevant vault docs referenced in task plan
        payload.vaultDocs = await loadRelevantVaultDocs(projectRoot, payload.taskPlan);
      }
      break;

    case "COMPLETE_SLICE":
      if (m && s) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.slicePath(m, s)}/PLAN.md`);
        payload.upstreamSummaries = await loadAllTaskSummaries(projectRoot, m, s);
      }
      break;

    case "REASSESS":
      if (m) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.milestonePath(m)}/ROADMAP.md`);
        payload.upstreamSummaries = await loadAllSliceSummaries(projectRoot, m);
      }
      break;

    case "COMPLETE_MILESTONE":
      if (m) {
        payload.taskPlan = await loadFile(projectRoot, `${PATHS.milestonePath(m)}/ROADMAP.md`);
        payload.upstreamSummaries = await loadAllSliceSummaries(projectRoot, m);
      }
      break;
  }

  return payload;
}

// ─── File Loaders ────────────────────────────────────────────────

async function loadFile(projectRoot: string, relativePath: string): Promise<string> {
  const path = `${projectRoot}/${relativePath}`;
  const file = Bun.file(path);
  if (await file.exists()) {
    return await file.text();
  }
  return "";
}

async function loadUpstreamSliceSummaries(
  projectRoot: string,
  milestoneId: string,
  currentSliceId: string
): Promise<string[]> {
  const summaries: string[] = [];
  const slicesDir = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/slices`;

  try {
    const glob = new Bun.Glob("*/SUMMARY.md");
    for await (const path of glob.scan({ cwd: slicesDir })) {
      const sliceId = path.split("/")[0];
      if (sliceId && sliceId < currentSliceId) {
        const content = await loadFile(projectRoot, `${PATHS.milestonePath(milestoneId)}/slices/${path}`);
        if (content) summaries.push(content);
      }
    }
  } catch {
    // Directory may not exist yet
  }

  return summaries;
}

async function loadUpstreamTaskSummaries(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  currentTaskId: string
): Promise<string[]> {
  const summaries: string[] = [];
  const tasksDir = `${projectRoot}/${PATHS.slicePath(milestoneId, sliceId)}/tasks`;

  try {
    const glob = new Bun.Glob("*/SUMMARY.md");
    for await (const path of glob.scan({ cwd: tasksDir })) {
      const taskId = path.split("/")[0];
      if (taskId && taskId < currentTaskId) {
        const content = await loadFile(
          projectRoot,
          `${PATHS.slicePath(milestoneId, sliceId)}/tasks/${path}`
        );
        if (content) summaries.push(content);
      }
    }
  } catch {
    // Directory may not exist yet
  }

  return summaries;
}

async function loadAllTaskSummaries(
  projectRoot: string,
  milestoneId: string,
  sliceId: string
): Promise<string[]> {
  const summaries: string[] = [];
  const tasksDir = `${projectRoot}/${PATHS.slicePath(milestoneId, sliceId)}/tasks`;

  try {
    const glob = new Bun.Glob("*/SUMMARY.md");
    for await (const path of glob.scan({ cwd: tasksDir })) {
      const content = await loadFile(
        projectRoot,
        `${PATHS.slicePath(milestoneId, sliceId)}/tasks/${path}`
      );
      if (content) summaries.push(content);
    }
  } catch {
    // Directory may not exist yet
  }

  return summaries;
}

async function loadAllSliceSummaries(
  projectRoot: string,
  milestoneId: string
): Promise<string[]> {
  const summaries: string[] = [];
  const slicesDir = `${projectRoot}/${PATHS.milestonePath(milestoneId)}/slices`;

  try {
    const glob = new Bun.Glob("*/SUMMARY.md");
    for await (const path of glob.scan({ cwd: slicesDir })) {
      const content = await loadFile(projectRoot, `${PATHS.milestonePath(milestoneId)}/slices/${path}`);
      if (content) summaries.push(content);
    }
  } catch {
    // Directory may not exist yet
  }

  return summaries;
}

async function loadBoundaryContracts(
  projectRoot: string,
  milestoneId: string
): Promise<string[]> {
  const contracts: string[] = [];
  const contractsDir = `${projectRoot}/${PATHS.vault}/contracts`;

  try {
    const glob = new Bun.Glob(`${milestoneId}-*.md`);
    for await (const path of glob.scan({ cwd: contractsDir })) {
      const content = await loadFile(projectRoot, `${PATHS.vault}/contracts/${path}`);
      if (content) contracts.push(content);
    }
  } catch {
    // Directory may not exist yet
  }

  return contracts;
}

async function loadRelevantVaultDocs(
  projectRoot: string,
  taskPlan: string
): Promise<string[]> {
  // Simple relevance: scan task plan for vault doc references like [[patterns/typescript]]
  const refs = taskPlan.match(/\[\[([^\]]+)\]\]/g) ?? [];
  const docs: string[] = [];

  for (const ref of refs) {
    const docPath = ref.slice(2, -2); // strip [[ and ]]
    const content = await loadFile(projectRoot, `${PATHS.vault}/${docPath}.md`);
    if (content) docs.push(content);
  }

  return docs;
}
