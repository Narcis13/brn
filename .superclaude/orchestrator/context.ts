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

// ─── Token Budget Constants ─────────────────────────────────────

const CONTEXT_BUDGET = {
  taskPlan: 10_000,
  codeFiles: 40_000,
  upstreamSummaries: 10_000,
  vaultDocs: 10_000,
  boundaryContracts: 5_000,
  total: 80_000,
} as const;

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
    // "Implementation file(s): src/foo.ts" or "- src/foo.ts"
    /(?:^|\s)(src\/[\w/.,-]+\.(?:ts|tsx|js|jsx|json))/gm,
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

        // Load continue-here if it exists (continue-here protocol)
        const continueHere = await loadFile(
          projectRoot,
          `${PATHS.taskPath(m, s, t)}/CONTINUE.md`
        );
        if (continueHere) {
          payload.taskPlan += "\n\n## Continue From\n" + continueHere;
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

  // Apply token budget enforcement
  return applyTokenBudget(payload);
}

// ─── Token Budget Enforcement ────────────────────────────────────

function applyTokenBudget(payload: ContextPayload): ContextPayload {
  const result = { ...payload };

  // Trim task plan (highest priority — truncate if over budget)
  if (estimateTokens(result.taskPlan) > CONTEXT_BUDGET.taskPlan) {
    const maxChars = CONTEXT_BUDGET.taskPlan * 4;
    result.taskPlan = result.taskPlan.slice(0, maxChars);
  }

  // Trim code files (drop files from end until under budget)
  const codeEntries = Object.entries(result.codeFiles);
  const trimmedCode: Record<string, string> = {};
  let codeTokens = 0;
  for (const [path, content] of codeEntries) {
    const fileTokens = estimateTokens(content);
    if (codeTokens + fileTokens <= CONTEXT_BUDGET.codeFiles) {
      trimmedCode[path] = content;
      codeTokens += fileTokens;
    }
  }
  result.codeFiles = trimmedCode;

  // Trim upstream summaries (drop oldest first — they're in order)
  result.upstreamSummaries = trimToTokenBudget(
    result.upstreamSummaries,
    CONTEXT_BUDGET.upstreamSummaries
  );

  // Trim vault docs (lowest priority among content)
  result.vaultDocs = trimToTokenBudget(result.vaultDocs, CONTEXT_BUDGET.vaultDocs);

  // Trim boundary contracts
  result.boundaryContracts = trimToTokenBudget(
    result.boundaryContracts,
    CONTEXT_BUDGET.boundaryContracts
  );

  // Final check: if total exceeds budget, drop vault docs then summaries
  let totalTokens = computeTotalTokens(result);
  if (totalTokens > CONTEXT_BUDGET.total) {
    // Drop vault docs first
    while (result.vaultDocs.length > 0 && totalTokens > CONTEXT_BUDGET.total) {
      result.vaultDocs.pop();
      totalTokens = computeTotalTokens(result);
    }
  }
  if (totalTokens > CONTEXT_BUDGET.total) {
    // Then drop upstream summaries (oldest first = from start)
    while (result.upstreamSummaries.length > 0 && totalTokens > CONTEXT_BUDGET.total) {
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
