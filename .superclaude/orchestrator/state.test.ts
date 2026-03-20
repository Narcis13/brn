import { test, expect, beforeEach, afterEach } from "bun:test";
import { readState, writeState, advanceTDDPhase, advancePhase } from "./state.ts";
import type { ProjectState } from "./types.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-state";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("readState returns default when no state file exists", async () => {
  const state = await readState(TEST_ROOT);
  expect(state.phase).toBe("IDLE");
  expect(state.tddSubPhase).toBeNull();
  expect(state.currentMilestone).toBeNull();
  expect(state.currentSlice).toBeNull();
  expect(state.currentTask).toBeNull();
});

test("writeState produces valid JSON", async () => {
  const state: ProjectState = {
    phase: "EXECUTE_TASK",
    tddSubPhase: "IMPLEMENT",
    currentMilestone: "M001",
    currentSlice: "S01",
    currentTask: "T02",
    lastUpdated: "2026-03-17T22:00:00Z",
  };

  await writeState(TEST_ROOT, state);

  // Verify it's valid JSON
  const raw = await Bun.file(`${TEST_ROOT}/.superclaude/state/state.json`).json();
  expect(raw.phase).toBe("EXECUTE_TASK");
  expect(raw.tddSubPhase).toBe("IMPLEMENT");
  expect(raw.milestone).toBe("M001");
  expect(raw.slice).toBe("S01");
  expect(raw.task).toBe("T02");
  expect(raw.lastUpdated).toBeDefined();
});

test("writeState and readState roundtrip via JSON", async () => {
  const state: ProjectState = {
    phase: "EXECUTE_TASK",
    tddSubPhase: "IMPLEMENT",
    currentMilestone: "M001",
    currentSlice: "S01",
    currentTask: "T02",
    lastUpdated: "2026-03-17T22:00:00Z",
  };

  await writeState(TEST_ROOT, state);
  const loaded = await readState(TEST_ROOT);

  expect(loaded.phase).toBe("EXECUTE_TASK");
  expect(loaded.tddSubPhase).toBe("IMPLEMENT");
  expect(loaded.currentMilestone).toBe("M001");
  expect(loaded.currentSlice).toBe("S01");
  expect(loaded.currentTask).toBe("T02");
});

test("writeState handles null values", async () => {
  const state: ProjectState = {
    phase: "IDLE",
    tddSubPhase: null,
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    lastUpdated: new Date().toISOString(),
  };

  await writeState(TEST_ROOT, state);
  const loaded = await readState(TEST_ROOT);

  expect(loaded.phase).toBe("IDLE");
  expect(loaded.tddSubPhase).toBeNull();
  expect(loaded.currentMilestone).toBeNull();
});

test("readState recovers from malformed JSON", async () => {
  writeFileSync(`${TEST_ROOT}/.superclaude/state/state.json`, "not valid json {{{");
  const state = await readState(TEST_ROOT);
  expect(state.phase).toBe("IDLE");
  expect(state.tddSubPhase).toBeNull();
});

test("readState migrates from legacy STATE.md", async () => {
  // Write a legacy STATE.md file (no state.json exists)
  const legacyContent = `---
phase: EXECUTE_TASK
tdd_sub_phase: VERIFY
milestone: M001
slice: S01
task: T01
last_updated: 2026-03-19T16:48:57.499Z
---

## Current Position

- **Phase:** EXECUTE_TASK
`;
  writeFileSync(`${TEST_ROOT}/.superclaude/state/STATE.md`, legacyContent);

  const state = await readState(TEST_ROOT);
  expect(state.phase).toBe("EXECUTE_TASK");
  expect(state.tddSubPhase).toBe("IMPLEMENT"); // VERIFY migrated to IMPLEMENT
  expect(state.currentMilestone).toBe("M001");
  expect(state.currentSlice).toBe("S01");
  expect(state.currentTask).toBe("T01");

  // Verify it also wrote state.json for future reads
  const jsonExists = await Bun.file(`${TEST_ROOT}/.superclaude/state/state.json`).exists();
  expect(jsonExists).toBe(true);
});

test("readState migrates old TDD sub-phases from STATE.md", async () => {
  const legacyContent = `---
phase: EXECUTE_TASK
tdd_sub_phase: GREEN
milestone: M001
slice: S01
task: T01
last_updated: 2026-03-19T16:48:57.499Z
---
`;
  writeFileSync(`${TEST_ROOT}/.superclaude/state/STATE.md`, legacyContent);

  const state = await readState(TEST_ROOT);
  expect(state.tddSubPhase).toBe("IMPLEMENT"); // GREEN migrated to IMPLEMENT
});

test("advanceTDDPhase: IMPLEMENT → null (task complete)", () => {
  expect(advanceTDDPhase(null)).toBeNull();
  expect(advanceTDDPhase("IMPLEMENT")).toBeNull();
});

test("advancePhase follows correct transitions", () => {
  expect(advancePhase("IDLE")).toBe("DISCUSS");
  expect(advancePhase("DISCUSS")).toBe("RESEARCH");
  expect(advancePhase("RESEARCH")).toBe("PLAN_MILESTONE");
  expect(advancePhase("PLAN_MILESTONE")).toBe("PLAN_SLICE");
  expect(advancePhase("PLAN_SLICE")).toBe("EXECUTE_TASK");
  expect(advancePhase("EXECUTE_TASK")).toBe("COMPLETE_SLICE");
  expect(advancePhase("COMPLETE_SLICE")).toBe("RETROSPECTIVE");
  expect(advancePhase("RETROSPECTIVE")).toBe("REASSESS");
  expect(advancePhase("REASSESS")).toBe("PLAN_SLICE");
  expect(advancePhase("COMPLETE_MILESTONE")).toBe("IDLE");
});
