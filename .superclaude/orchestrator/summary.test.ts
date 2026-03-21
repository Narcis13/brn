import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  generateTaskSummary,
  generateSliceSummary,
  generateMilestoneSummary,
  compressText,
} from "./summary.ts";
import type { TaskSummary, SliceSummary } from "./types.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-summary";

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
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── compressText ───────────────────────────────────────────────

describe("compressText", () => {
  test("compresses long text to approximate target ratio", () => {
    const longText = Array.from({ length: 100 }, (_, i) => `Line ${i}: this is a line of text with some content.`).join("\n");
    const compressed = compressText(longText, 5); // 5:1 compression
    expect(compressed.length).toBeLessThan(longText.length);
    // Should be roughly 1/5th the size, with some tolerance
    expect(compressed.length).toBeLessThan(longText.length / 3);
  });

  test("returns original text if already short", () => {
    const shortText = "This is short.";
    const compressed = compressText(shortText, 5);
    expect(compressed).toBe(shortText);
  });

  test("preserves critical sections (frontmatter, headings)", () => {
    const text = `---
task: T01
status: complete
---

## What Was Built
Auth token generation system.

## Key Decisions
- Used jose library for JWT.

## What Downstream Should Know
- Call generateToken() for new tokens.

Some extra detail that can be compressed away.
More detail.
Even more detail.
And more.
Yet more.
Still more.
Extra content here.
And here.`;

    const compressed = compressText(text, 3);
    expect(compressed).toContain("What Was Built");
    expect(compressed).toContain("Auth token");
  });
});

// ─── generateTaskSummary ────────────────────────────────────────

describe("generateTaskSummary", () => {
  test("generates markdown summary from TaskSummary data", () => {
    const data: TaskSummary = {
      task: "T01",
      status: "complete",
      filesModified: ["src/auth.ts", "src/auth.test.ts"],
      patternsEstablished: ["JWT token pattern"],
      whatWasBuilt: "JWT token generation and verification helpers.",
      keyDecisions: { "JWT library": "Used jose instead of hand-rolling" },
      downstreamNotes: ["Import generateToken from src/auth.ts"],
    };

    const md = generateTaskSummary(data);
    expect(md).toContain("task: T01");
    expect(md).toContain("status: complete");
    expect(md).toContain("JWT token generation");
    expect(md).toContain("src/auth.ts");
    expect(md).toContain("jose");
    expect(md).toContain("generateToken");
  });

  test("handles empty fields gracefully", () => {
    const data: TaskSummary = {
      task: "T02",
      status: "complete",
      filesModified: [],
      patternsEstablished: [],
      whatWasBuilt: "Minor config update.",
      keyDecisions: {},
      downstreamNotes: [],
    };

    const md = generateTaskSummary(data);
    expect(md).toContain("task: T02");
    expect(md).toContain("Minor config update");
  });
});

// ─── generateSliceSummary ───────────────────────────────────────

describe("generateSliceSummary", () => {
  test("generates slice summary from task summaries", async () => {
    // Write task summaries on disk
    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T01/SUMMARY.md`,
      `---
task: T01
status: complete
files_modified: [src/auth.ts]
---

## What Was Built
Auth token generation.

## Key Decisions
- Used jose for JWT

## What Downstream Should Know
- Import generateToken from auth.ts`
    );

    writeFileSync(
      `${TEST_ROOT}/.superclaude/state/milestones/M001/slices/S01/tasks/T02/SUMMARY.md`,
      `---
task: T02
status: complete
files_modified: [src/login.ts]
---

## What Was Built
Login endpoint.

## Key Decisions
- POST /login returns JWT

## What Downstream Should Know
- Use POST /login with email/password`
    );

    const sliceData: SliceSummary = {
      slice: "S01",
      status: "complete",
      tasksCompleted: ["T01", "T02"],
      demoSentence: "User can log in with email and password",
      whatWasBuilt: "Authentication system with JWT tokens and login endpoint.",
      interfacesProduced: ["generateToken()", "verifyToken()", "POST /login"],
      patternsEstablished: ["JWT token pattern"],
      knownLimitations: ["No refresh token yet"],
    };

    const md = generateSliceSummary(sliceData);
    expect(md).toContain("slice: S01");
    expect(md).toContain("User can log in");
    expect(md).toContain("Authentication system");
    expect(md).toContain("generateToken");
    expect(md).toContain("No refresh token");
  });
});

// ─── generateMilestoneSummary ───────────────────────────────────

describe("generateMilestoneSummary", () => {
  test("generates milestone summary from slice summaries", () => {
    const sliceSummaries: SliceSummary[] = [
      {
        slice: "S01",
        status: "complete",
        tasksCompleted: ["T01", "T02"],
        demoSentence: "User can log in",
        whatWasBuilt: "Auth system",
        interfacesProduced: ["POST /login"],
        patternsEstablished: ["JWT pattern"],
        knownLimitations: ["No refresh tokens"],
      },
      {
        slice: "S02",
        status: "complete",
        tasksCompleted: ["T01"],
        demoSentence: "User can view dashboard",
        whatWasBuilt: "Dashboard with user data",
        interfacesProduced: ["GET /dashboard"],
        patternsEstablished: ["React query pattern"],
        knownLimitations: [],
      },
    ];

    const md = generateMilestoneSummary("M001", "MVP Auth + Dashboard", sliceSummaries);
    expect(md).toContain("milestone: M001");
    expect(md).toContain("User can log in");
    expect(md).toContain("User can view dashboard");
    expect(md).toContain("Auth system");
    expect(md).toContain("Dashboard");
  });
});
