import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CurrentState } from "./types.js";
import { ensureDirectory } from "./fs.js";

function runGit(root: string, args: string[]): string | null {
  if (!existsSync(join(root, ".git"))) {
    return null;
  }

  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function hasGitRepository(root: string): boolean {
  return existsSync(join(root, ".git"));
}

export function execGit(root: string, args: string[]): string {
  if (!hasGitRepository(root)) {
    throw new Error(`No git repository exists at ${root}.`);
  }

  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function branchExists(root: string, branch: string): boolean {
  return runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== null;
}

export function getHeadCommit(root: string): string {
  const commit = runGit(root, ["rev-parse", "HEAD"]);
  if (!commit) {
    throw new Error(`Unable to resolve HEAD for ${root}.`);
  }
  return commit;
}

export function getBranchHead(root: string, branch: string): string {
  const commit = runGit(root, ["rev-parse", branch]);
  if (!commit) {
    throw new Error(`Unable to resolve branch ${branch}.`);
  }
  return commit;
}

export function currentBranch(root: string): string | null {
  return runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
}

export function ensureBranch(root: string, branch: string, fromRef: string): string {
  if (!branchExists(root, branch)) {
    execGit(root, ["branch", branch, fromRef]);
  }
  return getBranchHead(root, branch);
}

export function resetBranchTo(root: string, branch: string, ref: string): string {
  execGit(root, ["branch", "-f", branch, ref]);
  return getBranchHead(root, branch);
}

export function ensureMilestoneBranch(root: string, branch: string, trunkBranch: string): string {
  return ensureBranch(root, branch, trunkBranch);
}

export function ensureTaskBranch(root: string, branch: string, baseRef: string): string {
  return ensureBranch(root, branch, baseRef);
}

export function removeWorktree(root: string, worktreePath: string): void {
  try {
    execGit(root, ["worktree", "remove", "--force", worktreePath]);
  } catch {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

export function ensureWorktree(root: string, worktreePath: string, branch: string): void {
  if (existsSync(worktreePath)) {
    try {
      const branchName = currentBranch(worktreePath);
      if (branchName === branch) {
        return;
      }
    } catch {
      // Fall through and recreate the worktree.
    }
    removeWorktree(root, worktreePath);
  }

  ensureDirectory(dirname(worktreePath));
  execGit(root, ["worktree", "add", worktreePath, branch]);
}

export function gitStatusPorcelain(root: string): string[] {
  const output = execGit(root, ["status", "--porcelain"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function diffPaths(root: string, fromRef: string, toRef: string): string[] {
  const output = execGit(root, ["diff", "--name-only", "--relative", `${fromRef}..${toRef}`]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createCommit(root: string, message: string): string {
  execGit(root, ["add", "-A"]);
  const status = gitStatusPorcelain(root);
  if (status.length === 0) {
    throw new Error(`No changes are available to commit in ${root}.`);
  }
  execGit(root, ["commit", "-m", message]);
  return getHeadCommit(root);
}

export function cherryPick(root: string, commit: string): string {
  execGit(root, ["cherry-pick", commit]);
  return getHeadCommit(root);
}

export function reconcileGitState(root: string, gitState: CurrentState["git"]): CurrentState["git"] {
  const dirtyOutput = runGit(root, ["status", "--porcelain"]);
  const branchName = runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const headCommit = runGit(root, ["rev-parse", "HEAD"]);

  if (dirtyOutput === null && branchName === null && headCommit === null) {
    return {
      ...gitState,
      milestone_branch: null,
      task_branch: null,
      head_commit: null,
      dirty: false,
    };
  }

  let milestoneBranch = gitState.milestone_branch;
  let taskBranch = gitState.task_branch;

  if (!branchName || branchName === "HEAD") {
    milestoneBranch = null;
    taskBranch = null;
  } else if (branchName === gitState.trunk_branch) {
    milestoneBranch = null;
    taskBranch = null;
  } else if (branchName.startsWith("milestone/")) {
    milestoneBranch = branchName;
    taskBranch = null;
  } else if (branchName.startsWith("task/")) {
    taskBranch = branchName;
  } else {
    milestoneBranch = null;
    taskBranch = null;
  }

  return {
    ...gitState,
    milestone_branch: milestoneBranch,
    task_branch: taskBranch,
    head_commit: headCommit ?? null,
    dirty: (dirtyOutput ?? "").length > 0,
  };
}
