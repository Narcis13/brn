import { test, expect, describe } from "bun:test";
import { computeNextState, getAgentRoleForPhase } from "./loop.ts";
import type { ProjectState } from "./types.ts";

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

  test("maps EXECUTE_TASK to implementer", () => {
    expect(getAgentRoleForPhase("EXECUTE_TASK", "IMPLEMENT")).toBe("implementer");
    expect(getAgentRoleForPhase("EXECUTE_TASK", null)).toBe("implementer");
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
