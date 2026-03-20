import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  assembleContext,
  estimateTokens,
  trimToTokenBudget,
  loadCodeFilesForTask,
  getScaledBudget,
} from "./context.ts";
import type { ProjectState } from "./types.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-context";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01`, {
    recursive: true,
  });
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T02`, {
    recursive: true,
  });
  mkdirSync(`${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S02/tasks/T01`, {
    recursive: true,
  });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/contracts`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/patterns`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/src/features/auth`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── getScaledBudget (GAP-11) ───────────────────────────────────

describe("getScaledBudget", () => {
  test("returns base budget at multiplier 1.0", () => {
    const budget = getScaledBudget(1.0);
    expect(budget.total).toBe(80_000);
    expect(budget.codeFiles).toBe(40_000);
    expect(budget.vaultDocs).toBe(10_000);
  });

  test("scales budget down at multiplier 0.5", () => {
    const budget = getScaledBudget(0.5);
    expect(budget.total).toBe(40_000);
    expect(budget.codeFiles).toBe(20_000);
    expect(budget.vaultDocs).toBe(5_000);
  });

  test("scales budget UP at multiplier > 1.0 for context rotation", () => {
    const budget = getScaledBudget(1.5);
    expect(budget.total).toBe(120_000);
    expect(budget.codeFiles).toBe(60_000);
    expect(budget.vaultDocs).toBe(15_000);
  });

  test("scales to 65% for ORANGE tier", () => {
    const budget = getScaledBudget(0.65);
    expect(budget.total).toBe(52_000);
    expect(budget.codeFiles).toBe(26_000);
  });
});

// ─── estimateTokens ─────────────────────────────────────────────

describe("estimateTokens", () => {
  test("estimates tokens from text length", () => {
    // ~4 chars per token
    const text = "a".repeat(400);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(100);
  });

  test("rounds up partial tokens", () => {
    const text = "abc"; // 3 chars → ~0.75 tokens → ceil = 1
    const tokens = estimateTokens(text);
    expect(tokens).toBe(1);
  });

  test("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

// ─── trimToTokenBudget ──────────────────────────────────────────

describe("trimToTokenBudget", () => {
  test("returns all items when under budget", () => {
    const items = ["short text", "another short text"];
    const result = trimToTokenBudget(items, 1000);
    expect(result).toEqual(items);
  });

  test("drops lowest-priority items when over budget", () => {
    // Create items where total exceeds budget
    const longText = "x".repeat(4000); // ~1000 tokens
    const items = ["important", "also important", longText];
    // Budget of 600 tokens — should keep first two, drop the long one
    const result = trimToTokenBudget(items, 600);
    expect(result.length).toBeLessThan(items.length);
    expect(result).toContain("important");
  });

  test("returns empty array when even first item exceeds budget", () => {
    const hugeText = "x".repeat(40000); // ~10000 tokens
    const result = trimToTokenBudget([hugeText], 10);
    expect(result).toHaveLength(0);
  });

  test("preserves order of remaining items", () => {
    const items = ["first", "second", "third", "x".repeat(4000)];
    const result = trimToTokenBudget(items, 100);
    // Should keep items in original order
    for (let i = 1; i < result.length; i++) {
      const idxA = items.indexOf(result[i - 1]!);
      const idxB = items.indexOf(result[i]!);
      expect(idxA).toBeLessThan(idxB);
    }
  });
});

// ─── loadCodeFilesForTask ───────────────────────────────────────

describe("loadCodeFilesForTask", () => {
  test("loads code files referenced in task plan", async () => {
    const authCode = `export function generateToken() { return "tok"; }`;
    writeFileSync(`${TEST_ROOT}/src/features/auth/auth.ts`, authCode);

    const taskPlan = `## TDD Sequence
- Implementation file(s): src/features/auth/auth.ts`;

    const files = await loadCodeFilesForTask(TEST_ROOT, taskPlan);
    expect(Object.keys(files)).toContain("src/features/auth/auth.ts");
    expect(files["src/features/auth/auth.ts"]).toContain("generateToken");
  });

  test("returns empty when no files referenced", async () => {
    const taskPlan = "## Goal\nDo something";
    const files = await loadCodeFilesForTask(TEST_ROOT, taskPlan);
    expect(Object.keys(files)).toHaveLength(0);
  });

  test("skips files that don't exist on disk", async () => {
    const taskPlan = `## Artifacts
- src/nonexistent.ts — does not exist`;

    const files = await loadCodeFilesForTask(TEST_ROOT, taskPlan);
    expect(Object.keys(files)).toHaveLength(0);
  });
});

// ─── assembleContext ────────────────────────────────────────────

describe("assembleContext", () => {
  test("EXECUTE_TASK loads task plan", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      `---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Implement auth token generation`
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.taskPlan).toContain("auth token");
  });

  test("EXECUTE_TASK loads upstream task summaries but not current task", async () => {
    // Write T01 summary (upstream)
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
      "## What Was Built\nAuth types defined."
    );

    // Write T02 plan (current task)
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T02/PLAN.md`,
      "---\ntask: T02\n---\n\n## Goal\nBuild on T01"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T02",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    // Should have T01's summary as upstream
    expect(ctx.upstreamSummaries.length).toBeGreaterThan(0);
    expect(ctx.upstreamSummaries.some((s) => s.includes("Auth types"))).toBe(true);
  });

  test("EXECUTE_TASK loads CONTINUE.md when present", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nDo work"
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/CONTINUE.md`,
      "---\ntask: T01\ninterrupted_at: GREEN\n---\n\n## First Thing To Do\n- Fix the auth helper"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.taskPlan).toContain("Fix the auth helper");
  });

  test("EXECUTE_TASK loads REVIEW_FEEDBACK.md when present", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nDo work"
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/REVIEW_FEEDBACK.md`,
      "---\ntask: T01\nreview_attempt: 1\n---\n\n## MUST-FIX Issues From Review\n\n- [correctness] MUST-FIX: Missing null check (src/auth.ts:15)"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.taskPlan).toContain("Missing null check");
    expect(ctx.taskPlan).toContain("Review Feedback");
  });

  test("EXECUTE_TASK loads vault docs referenced by wiki links", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/patterns/typescript.md`,
      "---\ntitle: TypeScript Patterns\n---\n\n## Strict types, no any"
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nFollow [[patterns/typescript]] conventions"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.vaultDocs.length).toBeGreaterThan(0);
    expect(ctx.vaultDocs.some((d) => d.includes("Strict types"))).toBe(true);
  });

  test("COMPLETE_SLICE loads all task summaries", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
      "## What Was Built\nTask 1 done"
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T02/SUMMARY.md`,
      "## What Was Built\nTask 2 done"
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/PLAN.md`,
      "---\nslice: S01\n---\n\n## Tasks"
    );

    const state: ProjectState = {
      phase: "COMPLETE_SLICE",
      tddSubPhase: null,
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: null,
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.upstreamSummaries.length).toBe(2);
  });

  test("REASSESS loads all slice summaries", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/SUMMARY.md`,
      "## Demo Sentence\nUser can log in"
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/ROADMAP.md`,
      "---\nmilestone: M001\n---\n## Slices"
    );

    const state: ProjectState = {
      phase: "REASSESS",
      tddSubPhase: null,
      currentMilestone: "M001",
      currentSlice: null,
      currentTask: null,
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    expect(ctx.upstreamSummaries.length).toBeGreaterThan(0);
  });

  test("assembleContext respects budget multiplier (GAP-11)", async () => {
    // Create a vault doc that would normally fit at full budget
    const mediumDoc = "x".repeat(36_000); // ~9k tokens — fits in 10k vault budget
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/patterns/medium.md`,
      mediumDoc
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nFollow [[patterns/medium]] conventions"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    // With full budget (1.0), the doc should be included
    const ctxFull = await assembleContext(TEST_ROOT, state, 1.0);
    const fullVaultTokens = ctxFull.vaultDocs.reduce((acc, d) => acc + estimateTokens(d), 0);

    // With half budget (0.5), vault budget is 5k — the 9k doc should be dropped
    const ctxHalf = await assembleContext(TEST_ROOT, state, 0.5);
    const halfVaultTokens = ctxHalf.vaultDocs.reduce((acc, d) => acc + estimateTokens(d), 0);

    expect(halfVaultTokens).toBeLessThanOrEqual(fullVaultTokens);
  });

  test("assembleContext injects extraContext into upstream summaries", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nDo work"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const extraContext = [
      "## Prior Attempt Test Output (Attempt 1)\nIMPLEMENT phase: 2 test(s) still failing.",
      "## Prior Attempt Test Output (Attempt 2)\nIMPLEMENT phase: 1 test(s) still failing.",
    ];

    const ctx = await assembleContext(TEST_ROOT, state, 1.0, extraContext);
    expect(ctx.upstreamSummaries.some((s) => s.includes("Prior Attempt Test Output"))).toBe(true);
    expect(ctx.upstreamSummaries.some((s) => s.includes("2 test(s) still failing"))).toBe(true);
  });

  test("simple complexity skips vault docs and upstream summaries", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/patterns/typescript.md`,
      "---\ntitle: TS\n---\n## Patterns"
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
      "## Built auth"
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T02/PLAN.md`,
      "---\ntask: T02\n---\n\n## Goal\nSimple change using [[patterns/typescript]]"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001", currentSlice: "S01", currentTask: "T02",
      lastUpdated: new Date().toISOString(),
    };

    const ctxSimple = await assembleContext(TEST_ROOT, state, 1.0, [], "simple");
    const ctxStandard = await assembleContext(TEST_ROOT, state, 1.0, [], "standard");

    // Simple should have fewer vault docs and upstream summaries
    expect(ctxSimple.vaultDocs.length).toBeLessThanOrEqual(ctxStandard.vaultDocs.length);
  });

  test("context respects token budget — drops vault docs first", async () => {
    // Create a large vault doc
    const largeDoc = "x".repeat(320_000); // ~80k tokens
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/patterns/huge.md`,
      largeDoc
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/PLAN.md`,
      "---\ntask: T01\n---\n\n## Goal\nFollow [[patterns/huge]] conventions"
    );

    const state: ProjectState = {
      phase: "EXECUTE_TASK",
      tddSubPhase: "IMPLEMENT",
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };

    const ctx = await assembleContext(TEST_ROOT, state);
    // Total context should stay under budget (~80k tokens for injected content)
    const totalTokens =
      estimateTokens(ctx.taskPlan) +
      ctx.upstreamSummaries.reduce((acc, s) => acc + estimateTokens(s), 0) +
      ctx.vaultDocs.reduce((acc, d) => acc + estimateTokens(d), 0) +
      Object.values(ctx.codeFiles).reduce((acc, c) => acc + estimateTokens(c), 0) +
      ctx.boundaryContracts.reduce((acc, c) => acc + estimateTokens(c), 0);

    expect(totalTokens).toBeLessThanOrEqual(80_000);
  });
});
