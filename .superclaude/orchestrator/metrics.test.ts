import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createSessionMetrics,
  writeSessionMetrics,
  loadSessionMetrics,
  listSessionMetrics,
  analyzeTrend,
  computeTrendDirection,
  computeCompoundingScore,
  generateMetricsSummary,
} from "./metrics.ts";
import type { SessionMetrics, TrendPoint } from "./types.ts";

const TEST_ROOT = "/tmp/superclaude-test-metrics";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/history/metrics`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── createSessionMetrics ───────────────────────────────────────

test("createSessionMetrics initializes with zero values", () => {
  const m = createSessionMetrics("2026-03-17-night");
  expect(m.session).toBe("2026-03-17-night");
  expect(m.tasksAttempted).toBe(0);
  expect(m.tasksCompleted).toBe(0);
  expect(m.tasksFailed).toBe(0);
  expect(m.testsWritten).toBe(0);
  expect(m.testsPassing).toBe(0);
  expect(m.testsFailing).toBe(0);
  expect(m.postmortemsGenerated).toBe(0);
  expect(m.totalCost).toBe(0);
  expect(m.timestamp).toBeTruthy();
});

// ─── Persistence roundtrip ──────────────────────────────────────

test("writeSessionMetrics and loadSessionMetrics roundtrip", async () => {
  const m = createSessionMetrics("roundtrip-test");
  m.tasksAttempted = 10;
  m.tasksCompleted = 8;
  m.tasksFailed = 2;
  m.testsWritten = 45;
  m.testsPassing = 43;
  m.testsFailing = 2;
  m.totalCost = 12.50;
  m.postmortemsGenerated = 1;
  m.reviewIssues = { "MUST-FIX": 2, "SHOULD-FIX": 5, "CONSIDER": 3 };
  m.tokenUsage = { "EXECUTE_TASK": 500_000, "RESEARCH": 100_000 };
  m.costPerPhase = { "EXECUTE_TASK": 10.0, "RESEARCH": 2.50 };

  await writeSessionMetrics(TEST_ROOT, m);
  const loaded = await loadSessionMetrics(TEST_ROOT, "roundtrip-test");

  expect(loaded).not.toBeNull();
  expect(loaded!.session).toBe("roundtrip-test");
  expect(loaded!.tasksAttempted).toBe(10);
  expect(loaded!.tasksCompleted).toBe(8);
  expect(loaded!.tasksFailed).toBe(2);
  expect(loaded!.totalCost).toBe(12.50);
  expect(loaded!.postmortemsGenerated).toBe(1);
});

// ─── listSessionMetrics ─────────────────────────────────────────

test("listSessionMetrics returns all session IDs", async () => {
  const m1 = createSessionMetrics("session-1");
  const m2 = createSessionMetrics("session-2");

  await writeSessionMetrics(TEST_ROOT, m1);
  await writeSessionMetrics(TEST_ROOT, m2);

  const ids = await listSessionMetrics(TEST_ROOT);
  expect(ids).toContain("session-1");
  expect(ids).toContain("session-2");
});

// ─── computeTrendDirection ──────────────────────────────────────

test("computeTrendDirection returns improving when value increases for success metric", () => {
  const direction = computeTrendDirection(80, 60, true);
  expect(direction).toBe("improving");
});

test("computeTrendDirection returns degrading when value decreases for success metric", () => {
  const direction = computeTrendDirection(50, 80, true);
  expect(direction).toBe("degrading");
});

test("computeTrendDirection returns improving when value decreases for failure metric", () => {
  // For failure metrics (higherIsBetter=false), lower is better
  const direction = computeTrendDirection(2, 5, false);
  expect(direction).toBe("improving");
});

test("computeTrendDirection returns stable when change is small", () => {
  const direction = computeTrendDirection(10, 10, true);
  expect(direction).toBe("stable");
});

// ─── analyzeTrend ───────────────────────────────────────────────

test("analyzeTrend computes trend from data points", () => {
  const points: TrendPoint[] = [
    { session: "s1", value: 60 },
    { session: "s2", value: 70 },
    { session: "s3", value: 80 },
  ];

  const trend = analyzeTrend("completion-rate", points, true);
  expect(trend.metric).toBe("completion-rate");
  expect(trend.direction).toBe("improving");
  expect(trend.current).toBe(80);
  expect(trend.previous).toBe(70);
  expect(trend.percentChange).toBeGreaterThan(0);
  expect(trend.dataPoints).toHaveLength(3);
});

test("analyzeTrend returns stable for single data point", () => {
  const points: TrendPoint[] = [
    { session: "s1", value: 50 },
  ];

  const trend = analyzeTrend("completion-rate", points, true);
  expect(trend.direction).toBe("stable");
  expect(trend.percentChange).toBe(0);
});

// ─── computeCompoundingScore ────────────────────────────────────

test("computeCompoundingScore returns high score when all trends improve", () => {
  const trends = [
    { metric: "completion-rate", direction: "improving" as const, current: 90, previous: 70, percentChange: 28, dataPoints: [] },
    { metric: "failure-rate", direction: "improving" as const, current: 5, previous: 15, percentChange: -66, dataPoints: [] },
    { metric: "cost-per-task", direction: "improving" as const, current: 0.5, previous: 1.0, percentChange: -50, dataPoints: [] },
  ];

  const score = computeCompoundingScore(trends);
  expect(score).toBeGreaterThanOrEqual(80);
  expect(score).toBeLessThanOrEqual(100);
});

test("computeCompoundingScore returns low score when all trends degrade", () => {
  const trends = [
    { metric: "completion-rate", direction: "degrading" as const, current: 50, previous: 80, percentChange: -37, dataPoints: [] },
    { metric: "failure-rate", direction: "degrading" as const, current: 30, previous: 10, percentChange: 200, dataPoints: [] },
  ];

  const score = computeCompoundingScore(trends);
  expect(score).toBeLessThanOrEqual(30);
});

test("computeCompoundingScore returns 50 when no trends", () => {
  const score = computeCompoundingScore([]);
  expect(score).toBe(50);
});

// ─── generateMetricsSummary ─────────────────────────────────────

test("generateMetricsSummary produces a MetricsSummary from session data", async () => {
  const m1 = createSessionMetrics("s1");
  m1.tasksAttempted = 10;
  m1.tasksCompleted = 6;
  m1.tasksFailed = 4;
  m1.totalCost = 15.00;

  const m2 = createSessionMetrics("s2");
  m2.tasksAttempted = 10;
  m2.tasksCompleted = 8;
  m2.tasksFailed = 2;
  m2.totalCost = 12.00;

  await writeSessionMetrics(TEST_ROOT, m1);
  await writeSessionMetrics(TEST_ROOT, m2);

  const summary = await generateMetricsSummary(TEST_ROOT);
  expect(summary.sessions).toBe(2);
  expect(summary.trends.length).toBeGreaterThan(0);
  expect(summary.compoundingScore).toBeGreaterThanOrEqual(0);
  expect(summary.compoundingScore).toBeLessThanOrEqual(100);
});
