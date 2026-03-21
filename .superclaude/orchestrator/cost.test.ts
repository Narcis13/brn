import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createCostTracker,
  recordCostEntry,
  getTotalCost,
  getCostByPhase,
  isBudgetExceeded,
  estimateCost,
} from "./cost.ts";
import type { Phase } from "./types.ts";

const TEST_ROOT = "/tmp/superclaude-test-cost";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/history/metrics`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("createCostTracker initializes an empty tracker", async () => {
  const tracker = createCostTracker("2026-03-17-night");
  expect(tracker.session).toBe("2026-03-17-night");
  expect(tracker.entries).toHaveLength(0);
  expect(tracker.totalCost).toBe(0);
});

test("recordCostEntry adds an entry and updates total", () => {
  const tracker = createCostTracker("test-session");
  const updated = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 10_000,
    tokensOut: 5_000,
    estimatedCost: 0.12,
    timestamp: "2026-03-17T22:00:00Z",
  });

  expect(updated.entries).toHaveLength(1);
  expect(updated.totalCost).toBe(0.12);
});

test("recordCostEntry accumulates multiple entries", () => {
  let tracker = createCostTracker("test-session");

  tracker = recordCostEntry(tracker, {
    phase: "RESEARCH" as Phase,
    tokensIn: 20_000,
    tokensOut: 5_000,
    estimatedCost: 0.09,
    timestamp: "2026-03-17T22:00:00Z",
  });

  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 40_000,
    tokensOut: 20_000,
    estimatedCost: 0.42,
    timestamp: "2026-03-17T22:15:00Z",
  });

  expect(tracker.entries).toHaveLength(2);
  expect(tracker.totalCost).toBeCloseTo(0.51, 2);
});

test("getTotalCost returns accumulated cost", () => {
  let tracker = createCostTracker("test-session");
  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 10_000,
    tokensOut: 5_000,
    estimatedCost: 0.50,
    timestamp: "2026-03-17T22:00:00Z",
  });
  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 10_000,
    tokensOut: 5_000,
    estimatedCost: 0.50,
    timestamp: "2026-03-17T22:10:00Z",
  });

  expect(getTotalCost(tracker)).toBeCloseTo(1.0, 2);
});

test("getCostByPhase groups costs per phase", () => {
  let tracker = createCostTracker("test-session");

  tracker = recordCostEntry(tracker, {
    phase: "RESEARCH" as Phase,
    tokensIn: 20_000,
    tokensOut: 5_000,
    estimatedCost: 0.09,
    timestamp: "2026-03-17T22:00:00Z",
  });

  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 40_000,
    tokensOut: 20_000,
    estimatedCost: 0.42,
    timestamp: "2026-03-17T22:15:00Z",
  });

  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 30_000,
    tokensOut: 15_000,
    estimatedCost: 0.30,
    timestamp: "2026-03-17T22:30:00Z",
  });

  const byPhase = getCostByPhase(tracker);
  expect(byPhase["RESEARCH"]).toBeCloseTo(0.09, 2);
  expect(byPhase["EXECUTE_TASK"]).toBeCloseTo(0.72, 2);
});

test("isBudgetExceeded returns false when under budget", () => {
  let tracker = createCostTracker("test-session");
  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 10_000,
    tokensOut: 5_000,
    estimatedCost: 5.00,
    timestamp: "2026-03-17T22:00:00Z",
  });

  expect(isBudgetExceeded(tracker, 25.0)).toBe(false);
});

test("estimateCost uses model-specific pricing", () => {
  const tokens = { in: 100_000, out: 10_000 };

  const opusCost = estimateCost(tokens.in, tokens.out, "opus");
  const sonnetCost = estimateCost(tokens.in, tokens.out, "sonnet");

  // Opus: 100k * $15/M + 10k * $75/M = $1.50 + $0.75 = $2.25
  expect(opusCost).toBeCloseTo(2.25, 2);

  // Sonnet: 100k * $3/M + 10k * $15/M = $0.30 + $0.15 = $0.45
  expect(sonnetCost).toBeCloseTo(0.45, 2);

  // Sonnet should be ~5x cheaper
  expect(sonnetCost).toBeLessThan(opusCost / 4);
});

test("estimateCost defaults to opus pricing for unknown model", () => {
  const opusCost = estimateCost(10_000, 1_000, "opus");
  const unknownCost = estimateCost(10_000, 1_000, "future-model");
  expect(unknownCost).toBe(opusCost);
});

test("isBudgetExceeded returns true when over budget", () => {
  let tracker = createCostTracker("test-session");
  tracker = recordCostEntry(tracker, {
    phase: "EXECUTE_TASK" as Phase,
    tokensIn: 100_000,
    tokensOut: 50_000,
    estimatedCost: 30.00,
    timestamp: "2026-03-17T22:00:00Z",
  });

  expect(isBudgetExceeded(tracker, 25.0)).toBe(true);
});
