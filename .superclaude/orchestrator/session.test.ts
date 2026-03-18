import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createSession,
  endSession,
  generateSessionReport,
  writeSessionReport,
  loadSessionReport,
} from "./session.ts";
import type { SessionReport } from "./types.ts";

const TEST_ROOT = "/tmp/superclaude-test-session";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/history`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("createSession returns a session with started timestamp and empty lists", () => {
  const session = createSession("2026-03-17-night");
  expect(session.session).toBe("2026-03-17-night");
  expect(session.started).toBeTruthy();
  expect(session.ended).toBe("");
  expect(session.status).toBe("completed");
  expect(session.tasksCompleted).toEqual([]);
  expect(session.issuesEncountered).toEqual([]);
  expect(session.blockedItems).toEqual([]);
  expect(session.totalCost).toBe(0);
});

test("endSession sets ended timestamp and status", () => {
  const session = createSession("test-session");
  const ended = endSession(session, "completed", 4.50);

  expect(ended.ended).toBeTruthy();
  expect(ended.status).toBe("completed");
  expect(ended.totalCost).toBe(4.50);
});

test("endSession with budget_exceeded status", () => {
  const session = createSession("test-session");
  const ended = endSession(session, "budget_exceeded", 26.00);
  expect(ended.status).toBe("budget_exceeded");
});

test("generateSessionReport produces valid markdown", () => {
  const report: SessionReport = {
    session: "2026-03-17-night",
    started: "2026-03-17T22:00:00Z",
    ended: "2026-03-18T06:30:00Z",
    status: "completed",
    tasksCompleted: ["S01/T01: Auth token tests", "S01/T02: Login endpoint"],
    issuesEncountered: ["Timeout on T01, retried successfully"],
    blockedItems: [],
    totalCost: 4.91,
  };

  const md = generateSessionReport(report);

  // Should have frontmatter
  expect(md).toContain("---");
  expect(md).toContain("session: 2026-03-17-night");
  expect(md).toContain("status: completed");

  // Should have task list
  expect(md).toContain("S01/T01: Auth token tests");
  expect(md).toContain("S01/T02: Login endpoint");

  // Should have issues
  expect(md).toContain("Timeout on T01, retried successfully");

  // Should have cost
  expect(md).toContain("4.91");
});

test("generateSessionReport handles empty lists gracefully", () => {
  const report: SessionReport = {
    session: "empty-session",
    started: "2026-03-17T22:00:00Z",
    ended: "2026-03-17T22:01:00Z",
    status: "error",
    tasksCompleted: [],
    issuesEncountered: [],
    blockedItems: [],
    totalCost: 0,
  };

  const md = generateSessionReport(report);
  expect(md).toContain("session: empty-session");
  expect(md).toContain("status: error");
  expect(md).toContain("_None_");
});

test("writeSessionReport and loadSessionReport roundtrip", async () => {
  const report: SessionReport = {
    session: "roundtrip-test",
    started: "2026-03-17T22:00:00Z",
    ended: "2026-03-18T06:30:00Z",
    status: "completed",
    tasksCompleted: ["S01/T01: Auth tests"],
    issuesEncountered: [],
    blockedItems: ["S02/T01: Needs API key"],
    totalCost: 3.50,
  };

  await writeSessionReport(TEST_ROOT, report);
  const loaded = await loadSessionReport(TEST_ROOT, "roundtrip-test");

  expect(loaded).not.toBeNull();
  expect(loaded!.session).toBe("roundtrip-test");
  expect(loaded!.status).toBe("completed");
  expect(loaded!.tasksCompleted).toContain("S01/T01: Auth tests");
  expect(loaded!.blockedItems).toContain("S02/T01: Needs API key");
  expect(loaded!.totalCost).toBe(3.50);
});
