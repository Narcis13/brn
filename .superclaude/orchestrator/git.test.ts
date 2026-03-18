import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createMilestoneBranch,
  commitTDDPhase,
  commitSliceComplete,
  commitMilestoneComplete,
  createCheckpoint,
  rollbackToCheckpoint,
  squashMergeToMain,
  tagRelease,
  isCleanWorkingTree,
  getCurrentBranch,
  getCheckpointRef,
} from "./git.ts";

const TEST_ROOT = "/tmp/superclaude-test-git";

async function initTestRepo(): Promise<void> {
  mkdirSync(TEST_ROOT, { recursive: true });
  const opts = { cwd: TEST_ROOT };
  await Bun.$`git init ${TEST_ROOT}`.quiet();
  await Bun.$`git -C ${TEST_ROOT} config user.email "test@test.com"`.quiet();
  await Bun.$`git -C ${TEST_ROOT} config user.name "Test"`.quiet();
  await Bun.write(`${TEST_ROOT}/README.md`, "# Test\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "init"`.quiet();
}

beforeEach(async () => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  await initTestRepo();
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── Branch Operations ──────────────────────────────────────────

test("createMilestoneBranch creates and switches to superc/MXXX", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  const branch = await getCurrentBranch(TEST_ROOT);
  expect(branch).toBe("superc/M001");
});

test("createMilestoneBranch is idempotent — switches if branch exists", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  // Switch away
  await Bun.$`git -C ${TEST_ROOT} checkout main`.quiet();
  // Create again — should switch, not error
  await createMilestoneBranch(TEST_ROOT, "M001");
  const branch = await getCurrentBranch(TEST_ROOT);
  expect(branch).toBe("superc/M001");
});

// ─── Commit Operations ──────────────────────────────────────────

test("commitTDDPhase commits with correct message format", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  await Bun.write(`${TEST_ROOT}/auth.test.ts`, "test('auth', () => {});\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();

  await commitTDDPhase(TEST_ROOT, "S01", "T01", "red", "write auth token tests");

  const log = await Bun.$`git -C ${TEST_ROOT} log --oneline -1`.text();
  expect(log).toContain("feat(S01/T01): [red] write auth token tests");
});

test("commitSliceComplete commits with correct message format", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  await Bun.write(`${TEST_ROOT}/slice-done.md`, "done\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();

  await commitSliceComplete(TEST_ROOT, "S01");

  const log = await Bun.$`git -C ${TEST_ROOT} log --oneline -1`.text();
  expect(log).toContain("feat(S01): complete slice");
});

test("commitMilestoneComplete commits with correct message format", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  await Bun.write(`${TEST_ROOT}/milestone-done.md`, "done\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();

  await commitMilestoneComplete(TEST_ROOT, "M001");

  const log = await Bun.$`git -C ${TEST_ROOT} log --oneline -1`.text();
  expect(log).toContain("feat(M001): milestone complete");
});

// ─── Checkpoint Protocol ────────────────────────────────────────

test("createCheckpoint tags current HEAD", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");
  await Bun.write(`${TEST_ROOT}/file1.ts`, "export const x = 1;\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "some work"`.quiet();

  const ref = await createCheckpoint(TEST_ROOT, "S01", "T01");
  expect(ref).toBeTruthy();

  const tagRef = await getCheckpointRef(TEST_ROOT, "S01", "T01");
  expect(tagRef).toBeTruthy();
});

test("rollbackToCheckpoint restores working tree to checkpoint", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");

  // Create a file and commit
  await Bun.write(`${TEST_ROOT}/original.ts`, "export const a = 1;\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "before checkpoint"`.quiet();

  // Create checkpoint
  await createCheckpoint(TEST_ROOT, "S01", "T01");

  // Make changes after checkpoint
  await Bun.write(`${TEST_ROOT}/bad-work.ts`, "export const bad = true;\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "bad work"`.quiet();

  // Rollback
  await rollbackToCheckpoint(TEST_ROOT, "S01", "T01");

  // bad-work.ts should not exist
  const exists = await Bun.file(`${TEST_ROOT}/bad-work.ts`).exists();
  expect(exists).toBe(false);

  // original.ts should still exist
  const origExists = await Bun.file(`${TEST_ROOT}/original.ts`).exists();
  expect(origExists).toBe(true);
});

// ─── Clean Working Tree ─────────────────────────────────────────

test("isCleanWorkingTree returns true for clean repo", async () => {
  const clean = await isCleanWorkingTree(TEST_ROOT);
  expect(clean).toBe(true);
});

test("isCleanWorkingTree returns false with uncommitted changes", async () => {
  await Bun.write(`${TEST_ROOT}/dirty.ts`, "dirty\n");
  const clean = await isCleanWorkingTree(TEST_ROOT);
  expect(clean).toBe(false);
});

// ─── Squash Merge ───────────────────────────────────────────────

test("squashMergeToMain squashes milestone branch into single main commit", async () => {
  await createMilestoneBranch(TEST_ROOT, "M001");

  // Make several commits on the milestone branch
  await Bun.write(`${TEST_ROOT}/feat1.ts`, "export const f1 = 1;\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "feat(S01/T01): [red] test"`.quiet();

  await Bun.write(`${TEST_ROOT}/feat2.ts`, "export const f2 = 2;\n");
  await Bun.$`git -C ${TEST_ROOT} add -A`.quiet();
  await Bun.$`git -C ${TEST_ROOT} commit -m "feat(S01/T01): [green] impl"`.quiet();

  // Squash merge
  await squashMergeToMain(TEST_ROOT, "M001", "User authentication system");

  // Should be on main now
  const branch = await getCurrentBranch(TEST_ROOT);
  expect(branch).toBe("main");

  // Main should have exactly 2 commits: init + squash
  const log = await Bun.$`git -C ${TEST_ROOT} log --oneline`.text();
  const commits = log.trim().split("\n");
  expect(commits.length).toBe(2);
  expect(commits[0]).toContain("feat(M001): User authentication system");

  // Files should exist on main
  const f1Exists = await Bun.file(`${TEST_ROOT}/feat1.ts`).exists();
  const f2Exists = await Bun.file(`${TEST_ROOT}/feat2.ts`).exists();
  expect(f1Exists).toBe(true);
  expect(f2Exists).toBe(true);
});

// ─── getCurrentBranch ───────────────────────────────────────────

test("getCurrentBranch returns correct branch name", async () => {
  const branch = await getCurrentBranch(TEST_ROOT);
  expect(branch).toBe("main");
});

// ─── tagRelease (GAP-14) ──────────────────────────────────────────

test("tagRelease creates an annotated tag for the milestone", async () => {
  const tagName = await tagRelease(TEST_ROOT, "M001", "First milestone release");
  expect(tagName).toBe("release/M001");

  // Verify tag exists
  const tags = await Bun.$`git -C ${TEST_ROOT} tag --list release/M001`.text();
  expect(tags.trim()).toBe("release/M001");
});

test("tagRelease replaces existing tag on re-tag", async () => {
  await tagRelease(TEST_ROOT, "M001", "First");
  // Tag again — should not throw
  const tagName = await tagRelease(TEST_ROOT, "M001", "Updated");
  expect(tagName).toBe("release/M001");

  const tags = await Bun.$`git -C ${TEST_ROOT} tag --list release/M001`.text();
  expect(tags.trim()).toBe("release/M001");
});
