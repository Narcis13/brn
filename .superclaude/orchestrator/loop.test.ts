import { test, expect, describe } from "bun:test";
import { computeNextState, getAgentRoleForPhase } from "./loop.ts";
import type { AttemptRecord } from "./loop.ts";
import type { ProjectState, DeferredTask } from "./types.ts";

// ─── computeNextState ────────────────────────────────────────────

describe("computeNextState", () => {
  const baseState: ProjectState = {
    phase: "IDLE",
    tddSubPhase: null,
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    lastUpdated: "2026-03-17T00:00:00Z",
  };

  test("applies discovered milestone from action", () => {
    const action = { phase: "DISCUSS", tddSubPhase: null, milestone: "M001" };
    const next = computeNextState(baseState, action);
    expect(next.currentMilestone).toBe("M001");
    expect(next.phase).toBe("DISCUSS");
  });

  test("applies discovered slice and task from action", () => {
    const state: ProjectState = { ...baseState, phase: "IDLE", currentMilestone: "M001" };
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" as const, slice: "S01", task: "T01" };
    const next = computeNextState(state, action);
    expect(next.currentSlice).toBe("S01");
    expect(next.currentTask).toBe("T01");
    expect(next.phase).toBe("EXECUTE_TASK");
    expect(next.tddSubPhase).toBe("IMPLEMENT");
  });

  test("clears task when action sets task to null (new slice)", () => {
    const state: ProjectState = { ...baseState, phase: "COMPLETE_SLICE", currentMilestone: "M001", currentSlice: "S01", currentTask: "T03" };
    const action = { phase: "PLAN_SLICE", tddSubPhase: null, slice: "S02", task: null };
    const next = computeNextState(state, action);
    expect(next.currentSlice).toBe("S02");
    expect(next.currentTask).toBeNull();
  });

  test("preserves milestone when action.milestone is undefined", () => {
    const state: ProjectState = { ...baseState, currentMilestone: "M001" };
    const action = { phase: "DISCUSS", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.currentMilestone).toBe("M001");
  });

  test("preserves slice/task when action fields are undefined", () => {
    const state: ProjectState = { ...baseState, phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", currentMilestone: "M001", currentSlice: "S01", currentTask: "T01" };
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" };
    const next = computeNextState(state, action);
    expect(next.currentSlice).toBe("S01");
    expect(next.currentTask).toBe("T01");
  });

  // ─── TDD Phase Advancement ──────────────────────────────────────

  test("advances TDD IMPLEMENT → COMPLETE_SLICE (task done)", () => {
    const state: ProjectState = { ...baseState, phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", currentMilestone: "M001", currentSlice: "S01", currentTask: "T01" };
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("COMPLETE_SLICE");
    expect(next.tddSubPhase).toBeNull();
  });

  // ─── Phase Transitions ──────────────────────────────────────────

  test("transitions from IDLE to DISCUSS", () => {
    const action = { phase: "DISCUSS", tddSubPhase: null, milestone: "M001" };
    const next = computeNextState(baseState, action);
    expect(next.phase).toBe("DISCUSS");
    expect(next.currentMilestone).toBe("M001");
  });

  test("transitions from DISCUSS to PLAN_MILESTONE", () => {
    const state: ProjectState = { ...baseState, phase: "DISCUSS", currentMilestone: "M001" };
    const action = { phase: "PLAN_MILESTONE", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("PLAN_MILESTONE");
  });

  test("transitions from PLAN_MILESTONE to PLAN_SLICE", () => {
    const state: ProjectState = { ...baseState, phase: "PLAN_MILESTONE", currentMilestone: "M001" };
    const action = { phase: "PLAN_SLICE", tddSubPhase: null, slice: "S01" };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("PLAN_SLICE");
    expect(next.currentSlice).toBe("S01");
  });

  test("transitions from PLAN_SLICE to EXECUTE_TASK with IMPLEMENT", () => {
    const state: ProjectState = { ...baseState, phase: "PLAN_SLICE", currentMilestone: "M001", currentSlice: "S01" };
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", task: "T01" };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("EXECUTE_TASK");
    expect(next.tddSubPhase).toBe("IMPLEMENT");
    expect(next.currentTask).toBe("T01");
  });

  test("transitions from COMPLETE_SLICE to RETROSPECTIVE", () => {
    const state: ProjectState = { ...baseState, phase: "COMPLETE_SLICE", currentMilestone: "M001", currentSlice: "S01" };
    const action = { phase: "RETROSPECTIVE", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("RETROSPECTIVE");
  });

  test("transitions from RETROSPECTIVE to REASSESS", () => {
    const state: ProjectState = { ...baseState, phase: "RETROSPECTIVE", currentMilestone: "M001", currentSlice: "S01" };
    const action = { phase: "REASSESS", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("REASSESS");
  });

  test("transitions from REASSESS to PLAN_SLICE (next slice)", () => {
    const state: ProjectState = { ...baseState, phase: "REASSESS", currentMilestone: "M001", currentSlice: "S01" };
    const action = { phase: "PLAN_SLICE", tddSubPhase: null, slice: "S02", task: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("PLAN_SLICE");
    expect(next.currentSlice).toBe("S02");
    expect(next.currentTask).toBeNull();
  });

  test("transitions from REASSESS to COMPLETE_MILESTONE (all slices done)", () => {
    const state: ProjectState = { ...baseState, phase: "REASSESS", currentMilestone: "M001", currentSlice: "S03" };
    const action = { phase: "COMPLETE_MILESTONE", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("COMPLETE_MILESTONE");
  });

  test("transitions from COMPLETE_MILESTONE to IDLE", () => {
    const state: ProjectState = { ...baseState, phase: "COMPLETE_MILESTONE", currentMilestone: "M001" };
    const action = { phase: "IDLE", tddSubPhase: null };
    const next = computeNextState(state, action);
    expect(next.phase).toBe("IDLE");
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  test("always updates lastUpdated timestamp", () => {
    const action = { phase: "IDLE", tddSubPhase: null };
    const next = computeNextState(baseState, action);
    expect(next.lastUpdated).not.toBe(baseState.lastUpdated);
  });

  test("does not mutate original state", () => {
    const state: ProjectState = { ...baseState, phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", currentMilestone: "M001", currentSlice: "S01", currentTask: "T01" };
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" };
    const next = computeNextState(state, action);
    expect(state.tddSubPhase).toBe("IMPLEMENT");
    expect(next.phase).toBe("COMPLETE_SLICE");
    expect(next.tddSubPhase).toBeNull();
  });
});

// ─── getAgentRoleForPhase ────────────────────────────────────────

describe("getAgentRoleForPhase", () => {
  test("maps DISCUSS to architect", () => {
    expect(getAgentRoleForPhase("DISCUSS", null)).toBe("architect");
  });

  test("maps RESEARCH to researcher", () => {
    expect(getAgentRoleForPhase("RESEARCH", null)).toBe("researcher");
  });

  test("maps PLAN_MILESTONE to architect", () => {
    expect(getAgentRoleForPhase("PLAN_MILESTONE", null)).toBe("architect");
  });

  test("maps PLAN_SLICE to architect", () => {
    expect(getAgentRoleForPhase("PLAN_SLICE", null)).toBe("architect");
  });

  test("maps EXECUTE_TASK to null (prompt-builder handles strategy-specific prompts)", () => {
    expect(getAgentRoleForPhase("EXECUTE_TASK", "IMPLEMENT")).toBeNull();
    expect(getAgentRoleForPhase("EXECUTE_TASK", null)).toBeNull();
  });

  test("maps COMPLETE_SLICE to scribe", () => {
    expect(getAgentRoleForPhase("COMPLETE_SLICE", null)).toBe("scribe");
  });

  test("maps COMPLETE_MILESTONE to scribe", () => {
    expect(getAgentRoleForPhase("COMPLETE_MILESTONE", null)).toBe("scribe");
  });

  test("maps RETROSPECTIVE to evolver", () => {
    expect(getAgentRoleForPhase("RETROSPECTIVE", null)).toBe("evolver");
  });

  test("maps REASSESS to architect", () => {
    expect(getAgentRoleForPhase("REASSESS", null)).toBe("architect");
  });

  test("maps IDLE to null", () => {
    expect(getAgentRoleForPhase("IDLE", null)).toBeNull();
  });
});

// ─── DeferredTask Type Contract ─────────────────────────────────

describe("DeferredTask", () => {
  test("DeferredTask interface has required fields", () => {
    const deferred: DeferredTask = {
      taskKey: "S01/T02",
      milestone: "M001",
      slice: "S01",
      task: "T02",
      reason: "TDD IMPLEMENT failed after 3 attempts + Doctor diagnosis",
      failureContext: "2 test(s) still failing",
    };

    expect(deferred.taskKey).toBe("S01/T02");
    expect(deferred.milestone).toBe("M001");
    expect(deferred.slice).toBe("S01");
    expect(deferred.task).toBe("T02");
    expect(deferred.reason).toContain("failed");
    expect(deferred.failureContext).toContain("failing");
  });

  test("computeNextState can set up retry state for deferred task", () => {
    // Simulate: a deferred task is being retried by setting state back to EXECUTE_TASK
    const currentState: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T03", // was working on T03
      lastUpdated: "2026-03-17T00:00:00Z",
    };

    // After T03 succeeds, we want to retry deferred T02
    // The loop sets state directly, but computeNextState should handle
    // a fresh EXECUTE_TASK → COMPLETE_SLICE transition for the retry too
    const action = { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" as const, task: "T02" };
    const next = computeNextState(
      { ...currentState, phase: "IDLE", tddSubPhase: null },
      action
    );
    expect(next.phase).toBe("EXECUTE_TASK");
    expect(next.tddSubPhase).toBe("IMPLEMENT");
    expect(next.currentTask).toBe("T02");
  });
});

// ─── AttemptRecord (Structured Doctor Handoff) ──────────────────

describe("AttemptRecord", () => {
  test("AttemptRecord captures structured attempt data", () => {
    const record: AttemptRecord = {
      attempt: 1,
      message: "IMPLEMENT phase: 2 test(s) still failing. Agent must fix implementation.",
      testOutput: "(fail) auth rejects expired token\n(fail) card creation validates title\n 5 pass\n 2 fail",
      timestamp: "2026-03-20T10:00:00Z",
    };

    expect(record.attempt).toBe(1);
    expect(record.message).toContain("2 test(s) still failing");
    expect(record.testOutput).toContain("(fail) auth rejects expired token");
    expect(record.timestamp).toBeDefined();
  });

  test("multiple AttemptRecords form a structured failure history", () => {
    const records: AttemptRecord[] = [
      {
        attempt: 1,
        message: "3 test(s) still failing",
        testOutput: "(fail) a\n(fail) b\n(fail) c",
        timestamp: "2026-03-20T10:00:00Z",
      },
      {
        attempt: 2,
        message: "2 test(s) still failing",
        testOutput: "(fail) a\n(fail) b",
        timestamp: "2026-03-20T10:01:00Z",
      },
      {
        attempt: 3,
        message: "1 test(s) still failing",
        testOutput: "(fail) a",
        timestamp: "2026-03-20T10:02:00Z",
      },
    ];

    // Each successive attempt should show fewer failures (progress)
    expect(records[0]!.message).toContain("3");
    expect(records[1]!.message).toContain("2");
    expect(records[2]!.message).toContain("1");
    expect(records).toHaveLength(3);

    // Full test output is preserved, not truncated
    expect(records[0]!.testOutput).toContain("(fail) c");
    expect(records[2]!.testOutput).not.toContain("(fail) c");
  });
});
