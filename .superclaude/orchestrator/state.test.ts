import { test, expect, beforeEach, afterEach } from "bun:test";
import { readState, writeState, advanceTDDPhase, advancePhase } from "./state.ts";
import type { ProjectState } from "./types.ts";
import { rmSync, mkdirSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-state";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("readState returns default when no STATE.md exists", async () => {
  const state = await readState(TEST_ROOT);
  expect(state.phase).toBe("IDLE");
  expect(state.tddSubPhase).toBeNull();
  expect(state.currentMilestone).toBeNull();
  expect(state.currentSlice).toBeNull();
  expect(state.currentTask).toBeNull();
});

test("writeState and readState roundtrip", async () => {
  const state: ProjectState = {
    phase: "EXECUTE_TASK",
    tddSubPhase: "GREEN",
    currentMilestone: "M001",
    currentSlice: "S01",
    currentTask: "T02",
    lastUpdated: "2026-03-17T22:00:00Z",
  };

  await writeState(TEST_ROOT, state);
  const loaded = await readState(TEST_ROOT);

  expect(loaded.phase).toBe("EXECUTE_TASK");
  expect(loaded.tddSubPhase).toBe("GREEN");
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

test("advanceTDDPhase follows RED → GREEN → REFACTOR → VERIFY → null", () => {
  expect(advanceTDDPhase(null)).toBe("GREEN");
  expect(advanceTDDPhase("RED")).toBe("GREEN");
  expect(advanceTDDPhase("GREEN")).toBe("REFACTOR");
  expect(advanceTDDPhase("REFACTOR")).toBe("VERIFY");
  expect(advanceTDDPhase("VERIFY")).toBeNull();
});

test("advancePhase follows correct transitions", () => {
  expect(advancePhase("IDLE")).toBe("DISCUSS");
  expect(advancePhase("DISCUSS")).toBe("RESEARCH");
  expect(advancePhase("RESEARCH")).toBe("PLAN_MILESTONE");
  expect(advancePhase("PLAN_MILESTONE")).toBe("PLAN_SLICE");
  expect(advancePhase("PLAN_SLICE")).toBe("EXECUTE_TASK");
  expect(advancePhase("EXECUTE_TASK")).toBe("COMPLETE_SLICE");
  expect(advancePhase("COMPLETE_SLICE")).toBe("REASSESS");
  expect(advancePhase("REASSESS")).toBe("PLAN_SLICE");
  expect(advancePhase("COMPLETE_MILESTONE")).toBe("IDLE");
});
