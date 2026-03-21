/**
 * SUPER_CLAUDE — Git Operations
 * Branch-per-milestone, TDD-phase commits, checkpoints, squash merge.
 *
 * All git operations are deterministic — no LLM reasoning here.
 * Per spec §13: Branch structure, commit convention, checkpoint protocol, squash merge.
 */

// ─── Staging Scope ──────────────────────────────────────────────

/**
 * Paths that Claude writes to and should be committed.
 * Everything else (orchestrator code, node_modules, etc.) is excluded.
 */
const STAGING_PATHS = [
  "playground/",
  ".superclaude/state/",
  ".superclaude/history/",
  ".superclaude/vault/",
];

// ─── Branch Operations ──────────────────────────────────────────

/**
 * Create (or switch to) a milestone branch: superc/MXXX.
 * Idempotent — if the branch exists, just switches to it.
 */
export async function createMilestoneBranch(
  projectRoot: string,
  milestoneId: string
): Promise<void> {
  const branchName = `superc/${milestoneId}`;

  // Check if branch exists
  const existing = await Bun.$`git -C ${projectRoot} branch --list ${branchName}`
    .text()
    .catch(() => "");

  if (existing.trim()) {
    // Branch exists — switch to it
    await Bun.$`git -C ${projectRoot} checkout ${branchName}`.quiet();
  } else {
    // Create and switch
    await Bun.$`git -C ${projectRoot} checkout -b ${branchName}`.quiet();
  }
}

// ─── Commit Operations ──────────────────────────────────────────

/**
 * Commit staged changes with TDD phase marker.
 * Format: feat(SXX/TXX): [red|green|refactor] description
 */
export async function commitTDDPhase(
  projectRoot: string,
  sliceId: string,
  taskId: string,
  tddPhase: string,
  description: string
): Promise<void> {
  const message = `feat(${sliceId}/${taskId}): [${tddPhase}] ${description}`;
  await Bun.$`git -C ${projectRoot} commit -m ${message}`.quiet();
}

/**
 * Commit staged changes for slice completion.
 * Format: feat(SXX): complete slice
 */
export async function commitSliceComplete(
  projectRoot: string,
  sliceId: string
): Promise<void> {
  const message = `feat(${sliceId}): complete slice`;
  await Bun.$`git -C ${projectRoot} commit -m ${message}`.quiet();
}

/**
 * Commit staged changes for milestone completion.
 * Format: feat(MXXX): milestone complete
 */
export async function commitMilestoneComplete(
  projectRoot: string,
  milestoneId: string
): Promise<void> {
  const message = `feat(${milestoneId}): milestone complete`;
  await Bun.$`git -C ${projectRoot} commit -m ${message}`.quiet();
}

// ─── Checkpoint Protocol (§13.4) ─────────────────────────────────

/**
 * Create a checkpoint tag before a task begins.
 * Returns the tag ref name.
 */
export async function createCheckpoint(
  projectRoot: string,
  sliceId: string,
  taskId: string
): Promise<string> {
  const tagName = `checkpoint/${sliceId}/${taskId}`;

  // Delete existing tag if present (re-checkpointing)
  await Bun.$`git -C ${projectRoot} tag -d ${tagName}`
    .quiet()
    .catch(() => {});

  await Bun.$`git -C ${projectRoot} tag ${tagName}`.quiet();
  return tagName;
}

/**
 * Get the checkpoint ref for a task.
 * Returns the tag name or null if no checkpoint exists.
 */
export async function getCheckpointRef(
  projectRoot: string,
  sliceId: string,
  taskId: string
): Promise<string | null> {
  const tagName = `checkpoint/${sliceId}/${taskId}`;
  const result = await Bun.$`git -C ${projectRoot} tag --list ${tagName}`
    .text()
    .catch(() => "");

  return result.trim() || null;
}

/**
 * Rollback to a checkpoint — resets HEAD to the checkpoint tag.
 * This discards all commits made after the checkpoint on the current branch.
 */
export async function rollbackToCheckpoint(
  projectRoot: string,
  sliceId: string,
  taskId: string
): Promise<void> {
  const tagName = `checkpoint/${sliceId}/${taskId}`;
  await Bun.$`git -C ${projectRoot} reset --hard ${tagName}`.quiet();
}

// ─── Squash Merge (§13.5) ────────────────────────────────────────

/**
 * Squash merge the milestone branch into main.
 * Result: one commit on main with all milestone changes.
 * The milestone branch is kept (not deleted) for history.
 */
export async function squashMergeToMain(
  projectRoot: string,
  milestoneId: string,
  description: string
): Promise<void> {
  const branchName = `superc/${milestoneId}`;
  const message = `feat(${milestoneId}): ${description}`;

  await Bun.$`git -C ${projectRoot} checkout main`.quiet();
  await Bun.$`git -C ${projectRoot} merge --squash ${branchName}`.quiet();
  await Bun.$`git -C ${projectRoot} commit -m ${message}`.quiet();
}

// ─── Release Tagging (§6.8 — COMPLETE_MILESTONE) ──────────────────

/**
 * Tag the current HEAD as a release for the given milestone.
 * Per spec §6.8: "Tag the release" on milestone completion.
 * GAP-14 fix: Previously no git tags were created for milestones.
 */
export async function tagRelease(
  projectRoot: string,
  milestoneId: string,
  description: string = ""
): Promise<string> {
  const tagName = `release/${milestoneId}`;
  const message = description || `Release ${milestoneId}`;

  // Delete existing tag if present (re-tagging)
  await Bun.$`git -C ${projectRoot} tag -d ${tagName}`
    .quiet()
    .catch(() => {});

  await Bun.$`git -C ${projectRoot} tag -a ${tagName} -m ${message}`.quiet();
  return tagName;
}

// ─── Pull Request (milestone completion) ─────────────────────────

export interface PullRequestResult {
  success: boolean;
  url: string;
  message: string;
}

/**
 * Push the milestone branch and create a pull request to main.
 * Replaces squash-merge-to-main: the human reviews and merges.
 */
export async function createMilestonePR(
  projectRoot: string,
  milestoneId: string,
  description: string
): Promise<PullRequestResult> {
  const branchName = `superc/${milestoneId}`;

  // Push branch (with tags)
  try {
    await Bun.$`git -C ${projectRoot} push --set-upstream origin ${branchName} --tags`.quiet();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If remote doesn't exist or push fails, return gracefully
    return { success: false, url: "", message: `Push failed: ${msg}` };
  }

  // Create PR via gh CLI
  try {
    const title = `feat(${milestoneId}): ${description}`;
    const body = [
      `## ${milestoneId}: ${description}`,
      "",
      "Milestone completed by SUPER_CLAUDE orchestrator.",
      "",
      "### Review checklist",
      "- [ ] Code quality",
      "- [ ] Test coverage",
      "- [ ] Frontend servability (if applicable)",
      "- [ ] No stubs/TODOs in implementation",
    ].join("\n");

    const result = await Bun.$`gh pr create --repo origin --base main --head ${branchName} --title ${title} --body ${body}`.quiet().text();
    const url = result.trim();
    return { success: true, url, message: `PR created: ${url}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // PR may already exist
    if (msg.includes("already exists")) {
      return { success: true, url: "", message: "PR already exists for this branch" };
    }
    return { success: false, url: "", message: `PR creation failed: ${msg}` };
  }
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export async function isCleanWorkingTree(projectRoot: string): Promise<boolean> {
  const status = await Bun.$`git -C ${projectRoot} status --porcelain`.text();
  return status.trim().length === 0;
}

/**
 * Get the current branch name.
 */
export async function getCurrentBranch(projectRoot: string): Promise<string> {
  const branch = await Bun.$`git -C ${projectRoot} rev-parse --abbrev-ref HEAD`.text();
  return branch.trim();
}

/**
 * Stage only paths that Claude writes to — implementation code and state.
 * Never stages orchestrator code, preventing accidental self-modification commits.
 */
export async function stageAll(projectRoot: string): Promise<void> {
  for (const path of STAGING_PATHS) {
    // Use -- to separate pathspec; add only if path has changes
    await Bun.$`git -C ${projectRoot} add -A -- ${path}`
      .quiet()
      .catch(() => {});
  }
}

/**
 * Check if there are staged or unstaged changes within the scoped paths only.
 * Returns true if no changes exist in the staging scope.
 */
export async function isScopedClean(projectRoot: string): Promise<boolean> {
  let hasChanges = false;
  for (const path of STAGING_PATHS) {
    const status = await Bun.$`git -C ${projectRoot} status --porcelain -- ${path}`
      .text()
      .catch(() => "");
    if (status.trim().length > 0) {
      hasChanges = true;
      break;
    }
  }
  return !hasChanges;
}

/**
 * Stash any uncommitted work (checkpoint safety).
 */
export async function stashChanges(projectRoot: string): Promise<boolean> {
  const clean = await isCleanWorkingTree(projectRoot);
  if (clean) return false;

  await Bun.$`git -C ${projectRoot} stash push -m "superclaude-auto-stash"`.quiet();
  return true;
}

/**
 * Pop the most recent stash.
 */
export async function popStash(projectRoot: string): Promise<void> {
  await Bun.$`git -C ${projectRoot} stash pop`.quiet();
}
