import { test, expect } from "bun:test";
import {
  computePressure,
  shouldSkipPhase,
  getEffectiveContextBudget,
  formatPressureStatus,
  type PressureTier,
} from "./budget-pressure.ts";

// ─── Tier Computation ──────────────────────────────────────────

test("GREEN tier when under 50% budget", () => {
  const p = computePressure({ currentCost: 5, budgetCeiling: 25 });
  expect(p.tier).toBe("GREEN");
  expect(p.percentUsed).toBe(20);
});

test("GREEN tier at exactly 0%", () => {
  const p = computePressure({ currentCost: 0, budgetCeiling: 25 });
  expect(p.tier).toBe("GREEN");
  expect(p.percentUsed).toBe(0);
});

test("YELLOW tier when between 50-75%", () => {
  const p = computePressure({ currentCost: 15, budgetCeiling: 25 });
  expect(p.tier).toBe("YELLOW");
  expect(p.percentUsed).toBe(60);
});

test("ORANGE tier when between 75-90%", () => {
  const p = computePressure({ currentCost: 20, budgetCeiling: 25 });
  expect(p.tier).toBe("ORANGE");
  expect(p.percentUsed).toBe(80);
});

test("RED tier when above 90%", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(p.tier).toBe("RED");
  expect(p.percentUsed).toBe(96);
});

test("GREEN tier when budget ceiling is 0 (no budget)", () => {
  const p = computePressure({ currentCost: 10, budgetCeiling: 0 });
  expect(p.tier).toBe("GREEN");
});

test("boundary: exactly 50% is YELLOW", () => {
  const p = computePressure({ currentCost: 12.5, budgetCeiling: 25 });
  expect(p.tier).toBe("YELLOW");
});

test("boundary: exactly 75% is ORANGE", () => {
  const p = computePressure({ currentCost: 18.75, budgetCeiling: 25 });
  expect(p.tier).toBe("ORANGE");
});

test("boundary: exactly 90% is RED", () => {
  const p = computePressure({ currentCost: 22.5, budgetCeiling: 25 });
  expect(p.tier).toBe("RED");
});

// ─── Policy Properties ────────────────────────────────────────

test("GREEN allows all features", () => {
  const p = computePressure({ currentCost: 0, budgetCeiling: 25 });
  expect(p.allowResearch).toBe(true);
  expect(p.allowReview).toBe(true);
  expect(p.reviewPersonaCount).toBe(6);
  expect(p.contextBudgetMultiplier).toBe(1.0);
  expect(p.allowDiscuss).toBe(true);
  expect(p.allowRetrospective).toBe(true);
  expect(p.allowReassess).toBe(true);
});

test("YELLOW reduces review personas and context", () => {
  const p = computePressure({ currentCost: 15, budgetCeiling: 25 });
  expect(p.allowResearch).toBe(true);
  expect(p.reviewPersonaCount).toBe(3);
  expect(p.contextBudgetMultiplier).toBe(0.85);
});

test("ORANGE disables research, discuss, retrospective, reassess", () => {
  const p = computePressure({ currentCost: 20, budgetCeiling: 25 });
  expect(p.allowResearch).toBe(false);
  expect(p.allowDiscuss).toBe(false);
  expect(p.allowRetrospective).toBe(false);
  expect(p.allowReassess).toBe(false);
  expect(p.reviewPersonaCount).toBe(1);
});

test("RED disables everything except execution", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(p.allowResearch).toBe(false);
  expect(p.allowReview).toBe(false);
  expect(p.reviewPersonaCount).toBe(0);
  expect(p.contextBudgetMultiplier).toBe(0.5);
});

// ─── Phase Skipping ────────────────────────────────────────────

test("shouldSkipPhase returns false for DISCUSS in GREEN", () => {
  const p = computePressure({ currentCost: 0, budgetCeiling: 25 });
  expect(shouldSkipPhase("DISCUSS", p)).toBe(false);
});

test("shouldSkipPhase returns true for DISCUSS in ORANGE", () => {
  const p = computePressure({ currentCost: 20, budgetCeiling: 25 });
  expect(shouldSkipPhase("DISCUSS", p)).toBe(true);
});

test("shouldSkipPhase returns true for RESEARCH in RED", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(shouldSkipPhase("RESEARCH", p)).toBe(true);
});

test("shouldSkipPhase returns false for EXECUTE_TASK (never skipped)", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(shouldSkipPhase("EXECUTE_TASK", p)).toBe(false);
});

test("shouldSkipPhase returns false for RETROSPECTIVE in GREEN", () => {
  const p = computePressure({ currentCost: 0, budgetCeiling: 25 });
  expect(shouldSkipPhase("RETROSPECTIVE", p)).toBe(false);
});

test("shouldSkipPhase returns false for RETROSPECTIVE in YELLOW", () => {
  const p = computePressure({ currentCost: 15, budgetCeiling: 25 });
  expect(shouldSkipPhase("RETROSPECTIVE", p)).toBe(false);
});

test("shouldSkipPhase returns true for RETROSPECTIVE in ORANGE", () => {
  const p = computePressure({ currentCost: 20, budgetCeiling: 25 });
  expect(shouldSkipPhase("RETROSPECTIVE", p)).toBe(true);
});

test("shouldSkipPhase returns true for RETROSPECTIVE in RED", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(shouldSkipPhase("RETROSPECTIVE", p)).toBe(true);
});

test("shouldSkipPhase returns true for REASSESS in ORANGE", () => {
  const p = computePressure({ currentCost: 20, budgetCeiling: 25 });
  expect(shouldSkipPhase("REASSESS", p)).toBe(true);
});

// ─── Effective Context Budget ─────────────────────────────────

test("getEffectiveContextBudget applies multiplier", () => {
  const p = computePressure({ currentCost: 24, budgetCeiling: 25 });
  expect(getEffectiveContextBudget(80_000, p)).toBe(40_000);
});

test("getEffectiveContextBudget is full in GREEN", () => {
  const p = computePressure({ currentCost: 0, budgetCeiling: 25 });
  expect(getEffectiveContextBudget(80_000, p)).toBe(80_000);
});

// ─── Formatting ────────────────────────────────────────────────

test("formatPressureStatus includes tier and percent", () => {
  const p = computePressure({ currentCost: 15, budgetCeiling: 25 });
  const status = formatPressureStatus(p);
  expect(status).toContain("YELLOW");
  expect(status).toContain("60.0%");
});
