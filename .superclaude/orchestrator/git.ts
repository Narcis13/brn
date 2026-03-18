/**
 * SUPER_CLAUDE — Git Operations
 * Branch-per-milestone, TDD-phase commits, checkpoints, squash merge.
 *
 * All git operations are deterministic — no LLM reasoning here.
 * Per spec §13: Branch structure, commit convention, checkpoint protocol, squash merge.
 */

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
 * Stage all changes in the working tree.
 */
export async function stageAll(projectRoot: string): Promise<void> {
  await Bun.$`git -C ${projectRoot} add -A`.quiet();
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
