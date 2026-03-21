import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  acquireLock,
  releaseLock,
  isLocked,
  readLock,
  detectStuck,
  checkTimeout,
  type LockData,
  type StuckDetectionResult,
} from "./supervision.ts";

const TEST_ROOT = "/tmp/superclaude-test-supervision";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/state`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── Lock File ──────────────────────────────────────────────────

test("acquireLock creates lock file with task info", async () => {
  const result = await acquireLock(TEST_ROOT, "M001", "S01", "T01");
  expect(result).toBe(true);

  const locked = await isLocked(TEST_ROOT);
  expect(locked).toBe(true);
});

test("acquireLock fails if already locked", async () => {
  await acquireLock(TEST_ROOT, "M001", "S01", "T01");
  const result = await acquireLock(TEST_ROOT, "M001", "S01", "T02");
  expect(result).toBe(false);
});

test("releaseLock removes lock file", async () => {
  await acquireLock(TEST_ROOT, "M001", "S01", "T01");
  await releaseLock(TEST_ROOT);

  const locked = await isLocked(TEST_ROOT);
  expect(locked).toBe(false);
});

test("readLock returns lock data when locked", async () => {
  await acquireLock(TEST_ROOT, "M001", "S01", "T01");
  const data = await readLock(TEST_ROOT);

  expect(data).not.toBeNull();
  expect(data!.milestone).toBe("M001");
  expect(data!.slice).toBe("S01");
  expect(data!.task).toBe("T01");
  expect(data!.pid).toBeTruthy();
  expect(data!.startedAt).toBeTruthy();
});

test("readLock returns null when not locked", async () => {
  const data = await readLock(TEST_ROOT);
  expect(data).toBeNull();
});

// ─── Stuck Detection ────────────────────────────────────────────

test("detectStuck returns not_stuck for first dispatch", () => {
  const history: Array<{ task: string; timestamp: string }> = [];
  const result = detectStuck("S01/T01", history);
  expect(result.stuck).toBe(false);
  expect(result.reason).toBeNull();
});

test("detectStuck returns stuck when same task dispatched twice without progress", () => {
  const history = [
    { task: "S01/T01", timestamp: "2026-03-17T22:00:00Z" },
    { task: "S01/T01", timestamp: "2026-03-17T22:05:00Z" },
  ];
  const result = detectStuck("S01/T01", history);
  expect(result.stuck).toBe(true);
  expect(result.reason).toContain("dispatched twice");
});

test("detectStuck returns not_stuck when different tasks dispatched", () => {
  const history = [
    { task: "S01/T01", timestamp: "2026-03-17T22:00:00Z" },
    { task: "S01/T02", timestamp: "2026-03-17T22:05:00Z" },
  ];
  const result = detectStuck("S01/T02", history);
  expect(result.stuck).toBe(false);
});

// ─── Timeout Tiers (GAP-12) ──────────────────────────────────────

test("checkTimeout returns 'none' for short elapsed time", () => {
  expect(checkTimeout(5000)).toBe("none");
});

test("checkTimeout returns 'idle' at 10 minutes", () => {
  expect(checkTimeout(10 * 60 * 1000)).toBe("idle");
});

test("checkTimeout returns 'soft' at 15 minutes", () => {
  expect(checkTimeout(15 * 60 * 1000)).toBe("soft");
});

test("checkTimeout returns 'hard' at 30 minutes", () => {
  expect(checkTimeout(30 * 60 * 1000)).toBe("hard");
});

test("checkTimeout 'idle' is reachable between idle and soft thresholds", () => {
  // 12 minutes: above idle (10min) but below soft (15min)
  expect(checkTimeout(12 * 60 * 1000)).toBe("idle");
});

test("checkTimeout all tiers are distinct and reachable", () => {
  // Verify that all tiers are hit in the correct ranges
  expect(checkTimeout(5 * 60 * 1000)).toBe("none");    // 5min < idle(10min)
  expect(checkTimeout(12 * 60 * 1000)).toBe("idle");   // 12min: idle ≤ x < soft
  expect(checkTimeout(20 * 60 * 1000)).toBe("soft");   // 20min: soft ≤ x < hard
  expect(checkTimeout(35 * 60 * 1000)).toBe("hard");   // 35min: x ≥ hard
});
