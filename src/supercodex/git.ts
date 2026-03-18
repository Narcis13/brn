import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CurrentState } from "./types.js";

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
