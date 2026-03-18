import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import {
  listMilestones,
  findNextMilestone,
  listSpecs,
  findReadySpecs,
  listSlices,
  findNextSlice,
  listTasks,
  findNextTask,
  isSliceComplete,
  isMilestoneComplete,
  nextMilestoneId,
} from "./milestone-manager.ts";

const TEST_ROOT = "/tmp/superclaude-test-milestone";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/specs`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── Milestone Discovery ───────────────────────────────────────

test("listMilestones returns empty when no milestones exist", async () => {
  const milestones = await listMilestones(TEST_ROOT);
  expect(milestones).toHaveLength(0);
});

test("listMilestones finds milestones with ROADMAP.md", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`,
    `---\nmilestone: M001\nstatus: in_progress\ndescription: MVP Auth\n---\n`
  );

  const milestones = await listMilestones(TEST_ROOT);
  expect(milestones).toHaveLength(1);
  expect(milestones[0]!.id).toBe("M001");
  expect(milestones[0]!.status).toBe("in_progress");
  expect(milestones[0]!.description).toBe("MVP Auth");
});

test("listMilestones sorts by ID", async () => {
  for (const id of ["M003", "M001", "M002"]) {
    mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/${id}/slices`, { recursive: true });
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/${id}/ROADMAP.md`,
      `---\nmilestone: ${id}\nstatus: pending\ndescription: Milestone ${id}\n---\n`
    );
  }

  const milestones = await listMilestones(TEST_ROOT);
  expect(milestones).toHaveLength(3);
  expect(milestones[0]!.id).toBe("M001");
  expect(milestones[1]!.id).toBe("M002");
  expect(milestones[2]!.id).toBe("M003");
});

test("findNextMilestone returns in_progress first", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`,
    `---\nmilestone: M001\nstatus: complete\ndescription: Done\n---\n`
  );

  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M002/slices`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M002/ROADMAP.md`,
    `---\nmilestone: M002\nstatus: in_progress\ndescription: Active\n---\n`
  );

  const next = await findNextMilestone(TEST_ROOT);
  expect(next).toBe("M002");
});

test("findNextMilestone returns first pending when none in progress", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`,
    `---\nmilestone: M001\nstatus: pending\n---\n`
  );

  const next = await findNextMilestone(TEST_ROOT);
  expect(next).toBe("M001");
});

test("findNextMilestone returns null when all complete", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`,
    `---\nmilestone: M001\nstatus: complete\n---\n`
  );

  const next = await findNextMilestone(TEST_ROOT);
  expect(next).toBeNull();
});

// ─── Spec Discovery ────────────────────────────────────────────

test("listSpecs finds specs in specs directory", async () => {
  writeFileSync(
    `${TEST_ROOT}/.superclaude/specs/feature-auth.md`,
    `---\ntitle: User Auth\nstatus: ready\npriority: high\nmilestone: M001\n---\n`
  );

  const specs = await listSpecs(TEST_ROOT);
  expect(specs).toHaveLength(1);
  expect(specs[0]!.title).toBe("User Auth");
  expect(specs[0]!.status).toBe("ready");
  expect(specs[0]!.priority).toBe("high");
});

test("findReadySpecs filters to ready specs only", async () => {
  writeFileSync(
    `${TEST_ROOT}/.superclaude/specs/feature-auth.md`,
    `---\ntitle: Auth\nstatus: ready\n---\n`
  );
  writeFileSync(
    `${TEST_ROOT}/.superclaude/specs/draft-settings.md`,
    `---\ntitle: Settings\nstatus: draft\n---\n`
  );

  const ready = await findReadySpecs(TEST_ROOT);
  expect(ready).toHaveLength(1);
  expect(ready[0]!.title).toBe("Auth");
});

// ─── Slice Navigation ──────────────────────────────────────────

test("listSlices returns slices with status", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/PLAN.md`,
    `---\nslice: S01\nmilestone: M001\nstatus: pending\ndemo_sentence: "User can log in"\n---\n`
  );

  const slices = await listSlices(TEST_ROOT, "M001");
  expect(slices).toHaveLength(1);
  expect(slices[0]!.id).toBe("S01");
  expect(slices[0]!.status).toBe("pending");
  expect(slices[0]!.demoSentence).toBe("User can log in");
});

test("listSlices marks slice as complete when SUMMARY.md exists", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/PLAN.md`,
    `---\nslice: S01\nstatus: pending\n---\n`
  );
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/SUMMARY.md`,
    `---\nslice: S01\nstatus: complete\n---\n`
  );

  const slices = await listSlices(TEST_ROOT, "M001");
  expect(slices[0]!.status).toBe("complete");
});

test("findNextSlice returns first pending slice", async () => {
  for (const id of ["S01", "S02"]) {
    mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/${id}/tasks`, { recursive: true });
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/${id}/PLAN.md`,
      `---\nslice: ${id}\nstatus: pending\n---\n`
    );
  }
  // Mark S01 as complete
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/SUMMARY.md`,
    `done`
  );

  const next = await findNextSlice(TEST_ROOT, "M001");
  expect(next).toBe("S02");
});

// ─── Task Navigation ───────────────────────────────────────────

test("listTasks returns tasks with status", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
    `---\ntask: T01\nstatus: pending\n---\n\n## Goal\nWrite auth helpers\n`
  );

  const tasks = await listTasks(TEST_ROOT, "M001", "S01");
  expect(tasks).toHaveLength(1);
  expect(tasks[0]!.id).toBe("T01");
  expect(tasks[0]!.status).toBe("pending");
  expect(tasks[0]!.goal).toBe("Write auth helpers");
});

test("findNextTask returns first pending task", async () => {
  for (const id of ["T01", "T02"]) {
    mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/${id}`, { recursive: true });
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/${id}/PLAN.md`,
      `---\ntask: ${id}\nstatus: pending\n---\n\n## Goal\nTask ${id}\n`
    );
  }
  // Mark T01 as complete
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
    `done`
  );

  const next = await findNextTask(TEST_ROOT, "M001", "S01");
  expect(next).toBe("T02");
});

// ─── Completion Checks ─────────────────────────────────────────

test("isSliceComplete returns false when tasks are pending", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
    `---\ntask: T01\nstatus: pending\n---\n`
  );

  const complete = await isSliceComplete(TEST_ROOT, "M001", "S01");
  expect(complete).toBe(false);
});

test("isSliceComplete returns true when all tasks have SUMMARY.md", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01`, { recursive: true });
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
    `---\ntask: T01\nstatus: pending\n---\n`
  );
  writeFileSync(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
    `done`
  );

  const complete = await isSliceComplete(TEST_ROOT, "M001", "S01");
  expect(complete).toBe(true);
});

test("isSliceComplete returns false when no tasks exist", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks`, { recursive: true });

  const complete = await isSliceComplete(TEST_ROOT, "M001", "S01");
  expect(complete).toBe(false);
});

// ─── Next Milestone ID ─────────────────────────────────────────

test("nextMilestoneId returns M001 when no milestones exist", async () => {
  const id = await nextMilestoneId(TEST_ROOT);
  expect(id).toBe("M001");
});

test("nextMilestoneId increments from highest existing", async () => {
  for (const mid of ["M001", "M002"]) {
    mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/${mid}/slices`, { recursive: true });
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/${mid}/ROADMAP.md`,
      `---\nmilestone: ${mid}\nstatus: complete\n---\n`
    );
  }

  const id = await nextMilestoneId(TEST_ROOT);
  expect(id).toBe("M003");
});
