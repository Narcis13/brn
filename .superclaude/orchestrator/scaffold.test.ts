import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  scaffoldMilestone,
  scaffoldSlice,
  scaffoldTask,
  initializeProject,
} from "./scaffold.ts";
import { rmSync, mkdirSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-scaffold";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("scaffoldMilestone creates ROADMAP.md and CONTEXT.md", async () => {
  await scaffoldMilestone(TEST_ROOT, "M001", "MVP Authentication");

  const roadmap = Bun.file(`${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`);
  const context = Bun.file(`${TEST_ROOT}/.superclaude/state/milestones/M001/CONTEXT.md`);

  expect(await roadmap.exists()).toBe(true);
  expect(await context.exists()).toBe(true);

  const roadmapText = await roadmap.text();
  expect(roadmapText).toContain("milestone: M001");
  expect(roadmapText).toContain("MVP Authentication");
});

test("scaffoldSlice creates PLAN.md with demo sentence", async () => {
  await scaffoldMilestone(TEST_ROOT, "M001", "Test");
  await scaffoldSlice(TEST_ROOT, "M001", "S01", "User can sign up with email");

  const plan = Bun.file(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/PLAN.md`);
  expect(await plan.exists()).toBe(true);

  const planText = await plan.text();
  expect(planText).toContain("slice: S01");
  expect(planText).toContain("User can sign up with email");
});

test("scaffoldTask creates PLAN.md with goal", async () => {
  await scaffoldMilestone(TEST_ROOT, "M001", "Test");
  await scaffoldSlice(TEST_ROOT, "M001", "S01", "Demo");
  await scaffoldTask(TEST_ROOT, "M001", "S01", "T01", "Implement JWT generation");

  const plan = Bun.file(
    `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`
  );
  expect(await plan.exists()).toBe(true);

  const planText = await plan.text();
  expect(planText).toContain("task: T01");
  expect(planText).toContain("Implement JWT generation");
  expect(planText).toContain("[RED]");
  expect(planText).toContain("[GREEN]");
  expect(planText).toContain("[REFACTOR]");
});

test("initializeProject creates PROJECT.md, DECISIONS.md, and vault INDEX.md", async () => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state`, { recursive: true });
  await initializeProject(TEST_ROOT, "TestProject", "A test project");

  const project = Bun.file(`${TEST_ROOT}/.superclaude/state/PROJECT.md`);
  const decisions = Bun.file(`${TEST_ROOT}/.superclaude/state/DECISIONS.md`);
  const index = Bun.file(`${TEST_ROOT}/.superclaude/vault/INDEX.md`);

  expect(await project.exists()).toBe(true);
  expect(await decisions.exists()).toBe(true);
  expect(await index.exists()).toBe(true);

  const projectText = await project.text();
  expect(projectText).toContain("TestProject");
  expect(projectText).toContain("A test project");
});
