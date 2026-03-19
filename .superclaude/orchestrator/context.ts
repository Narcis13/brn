/**
 * SUPER_CLAUDE — Context Assembly Engine
 * Loads and assembles context for each phase, respecting token budgets.
 *
 * Budget breakdown (from spec §5.5):
 *   System instructions:     ~5,000 tokens
 *   Task plan + must-haves: ~10,000 tokens
 *   Relevant code files:    ~40,000 tokens
 *   Upstream summaries:     ~10,000 tokens
 *   Vault docs:             ~10,000 tokens
 *   Boundary contracts:      ~5,000 tokens
 *   Total injected context: ~80,000 tokens
 */

import { PATHS, type ContextPayload, type ProjectState } from "./types.ts";
import { listSpecs } from "./milestone-manager.ts";

/**
 * Load the spec file content for a given milestone.
 * Finds the spec whose frontmatter milestone matches.
 */
async function loadSpecForMilestone(
  projectRoot: string,
  milestoneId: string
): Promise<string> {
  const specs = await listSpecs(projectRoot);
  const match = specs.find((s) => s.milestone === milestoneId && s.status === "ready");
  if (!match) return "";

  const specPath = `${projectRoot}/${PATHS.specs}/${match.filename}`;
  const file = Bun.file(specPath);
  if (await file.exists()) {
    return await file.text();
  }
  return "";
}

// ─── Token Budget Constants ─────────────────────────────────────

export interface ContextBudgetValues {
  taskPlan: number;
  codeFiles: number;
  upstreamSummaries: number;
  vaultDocs: number;
  boundaryContracts: number;
  total: number;
}

const BASE_CONTEXT_BUDGET: ContextBudgetValues = {
  taskPlan: 10_000,
  codeFiles: 40_000,
  upstreamSummaries: 10_000,
  vaultDocs: 10_000,
  boundaryContracts: 5_000,
  total: 80_000,
};

/**
 * Apply a budget pressure multiplier to the base context budget.
 * GAP-11 fix: Previously the multiplier from budget-pressure.ts was never used.
 *
 * @param multiplier - 1.0 = full budget, 0.5 = half budget (from PressurePolicy.contextBudgetMultiplier)
 */
export function getScaledBudget(multiplier: number): ContextBudgetValues {
  if (multiplier >= 1.0) return BASE_CONTEXT_BUDGET;
  return {
    taskPlan: Math.ceil(BASE_CONTEXT_BUDGET.taskPlan * multiplier),
    codeFiles: Math.ceil(BASE_CONTEXT_BUDGET.codeFiles * multiplier),
    upstreamSummaries: Math.ceil(BASE_CONTEXT_BUDGET.upstreamSummaries * multiplier),
    vaultDocs: Math.ceil(BASE_CONTEXT_BUDGET.vaultDocs * multiplier),
    boundaryContracts: Math.ceil(BASE_CONTEXT_BUDGET.boundaryContracts * multiplier),
    total: Math.ceil(BASE_CONTEXT_BUDGET.total * multiplier),
  };
}

// For backward compatibility — used internally when no multiplier is provided
const CONTEXT_BUDGET = BASE_CONTEXT_BUDGET;

// ─── Token Estimation ───────────────────────────────────────────

/** Rough token estimate: 1 token ≈ 4 chars */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Budget Trimming ────────────────────────────────────────────

/**
 * Trim an array of text items to fit within a token budget.
 * Items are kept in order; lowest-priority items (last) are dropped first.
 */
export function trimToTokenBudget(items: string[], maxTokens: number): string[] {
  const kept: string[] = [];
  let tokensUsed = 0;

  for (const item of items) {
    const itemTokens = estimateTokens(item);
    if (tokensUsed + itemTokens <= maxTokens) {
      kept.push(item);
      tokensUsed += itemTokens;
    }
  }

  return kept;
}

// ─── Code File Loading ──────────────────────────────────────────

/**
 * Extract file paths from a task plan and load their contents.
 * Scans for paths matching common patterns:
 *   - `src/path/to/file.ts`
 *   - Implementation file(s): path
 *   - Artifacts: path — description
 */
export async function loadCodeFilesForTask(
  projectRoot: string,
  taskPlan: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  // Match file paths that look like source files
  const pathPatterns = [
    // "Implementation file(s): playground/src/foo.ts" or "- playground/src/foo.ts"
    /(?:^|\s)((?:playground\/)?src\/[\w/.,-]+\.(?:ts|tsx|js|jsx|json))/gm,
    // "path/to/file.ts — description"
    /(?:^|\s)([\w/.,-]+\.(?:ts|tsx|js|jsx))\s*[—\-]/gm,
  ];

  const foundPaths = new Set<string>();

  for (const pattern of pathPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(taskPlan)) !== null) {
      const filePath = match[1];
      if (filePath) {
        foundPaths.add(filePath);
      }
    }
  }

  for (const relPath of foundPaths) {
    const content = await loadFile(projectRoot, relPath);
    if (content) {
      files[relPath] = content;
    }
  }

  return files;
}

// ─── Context Assembly ────────────────────────────────────────────

export async function assembleContext(
  projectRoot: string,
  state: ProjectState,
  budgetMultiplier: number = 1.0
): Promise<ContextPayload> {
  const payload: ContextPayload = {
    taskPlan: "",
    codeFiles: {},
    upstreamSummaries: [],
    vaultDocs: [],
    boundaryContracts: [],
  };

  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;

  // Load the spec file for the current milestone — provides requirements, tech stack, paths
  if (m) {
    const specContent = await loadSpecForMilestone(projectRoot, m);
    if (specContent) {
      payload.upstreamSummaries.push(`## Feature Spec\n${specContent}`);
    }
  }

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

        // Load continue-here if it exists (continue-here protocol)
        const continueHere = await loadFile(
          projectRoot,
          `${PATHS.taskPath(m, s, t)}/CONTINUE.md`
        );
        if (continueHere) {
          payload.taskPlan += "\n\n## Continue From\n" + continueHere;
        }

        // Load review feedback if it exists (reviewer quality gate §8.3)
        const reviewFeedback = await loadFile(
          projectRoot,
          `${PATHS.taskPath(m, s, t)}/REVIEW_FEEDBACK.md`
        );
        if (reviewFeedback) {
          payload.taskPlan += "\n\n## Review Feedback (MUST FIX)\n" + reviewFeedback;
        }

        // Load upstream task summaries from same slice (not current task's)
        payload.upstreamSummaries = await loadUpstreamTaskSummaries(projectRoot, m, s, t);

        // Load relevant vault docs referenced in task plan
        payload.vaultDocs = await loadRelevantVaultDocs(projectRoot, payload.taskPlan);

        // Load code files referenced in task plan
        payload.codeFiles = await loadCodeFilesForTask(projectRoot, payload.taskPlan);
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

  // Apply token budget enforcement (scaled by pressure multiplier — GAP-11)
  const budget = getScaledBudget(budgetMultiplier);
  return applyTokenBudget(payload, budget);
}

// ─── Token Budget Enforcement ────────────────────────────────────

function applyTokenBudget(
  payload: ContextPayload,
  budget: ContextBudgetValues = CONTEXT_BUDGET
): ContextPayload {
  const result = { ...payload };

  // Trim task plan (highest priority — truncate if over budget)
  if (estimateTokens(result.taskPlan) > budget.taskPlan) {
    const maxChars = budget.taskPlan * 4;
    result.taskPlan = result.taskPlan.slice(0, maxChars);
  }

  // Trim code files (drop files from end until under budget)
  const codeEntries = Object.entries(result.codeFiles);
  const trimmedCode: Record<string, string> = {};
  let codeTokens = 0;
  for (const [path, content] of codeEntries) {
    const fileTokens = estimateTokens(content);
    if (codeTokens + fileTokens <= budget.codeFiles) {
      trimmedCode[path] = content;
      codeTokens += fileTokens;
    }
  }
  result.codeFiles = trimmedCode;

  // Trim upstream summaries (drop oldest first — they're in order)
  result.upstreamSummaries = trimToTokenBudget(
    result.upstreamSummaries,
    budget.upstreamSummaries
  );

  // Trim vault docs (lowest priority among content)
  result.vaultDocs = trimToTokenBudget(result.vaultDocs, budget.vaultDocs);

  // Trim boundary contracts
  result.boundaryContracts = trimToTokenBudget(
    result.boundaryContracts,
    budget.boundaryContracts
  );

  // Final check: if total exceeds budget, drop vault docs then summaries
  let totalTokens = computeTotalTokens(result);
  if (totalTokens > budget.total) {
    // Drop vault docs first
    while (result.vaultDocs.length > 0 && totalTokens > budget.total) {
      result.vaultDocs.pop();
      totalTokens = computeTotalTokens(result);
    }
  }
  if (totalTokens > budget.total) {
    // Then drop upstream summaries (oldest first = from start)
    while (result.upstreamSummaries.length > 0 && totalTokens > budget.total) {
      result.upstreamSummaries.shift();
      totalTokens = computeTotalTokens(result);
    }
  }

  return result;
}

function computeTotalTokens(payload: ContextPayload): number {
  return (
    estimateTokens(payload.taskPlan) +
    Object.values(payload.codeFiles).reduce((acc, c) => acc + estimateTokens(c), 0) +
    payload.upstreamSummaries.reduce((acc, s) => acc + estimateTokens(s), 0) +
    payload.vaultDocs.reduce((acc, d) => acc + estimateTokens(d), 0) +
    payload.boundaryContracts.reduce((acc, c) => acc + estimateTokens(c), 0)
  );
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
