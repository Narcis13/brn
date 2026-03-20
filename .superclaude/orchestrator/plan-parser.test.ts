import { test, expect, describe } from "bun:test";
import { parseTaskPlan } from "./plan-parser.ts";

// ─── Full PLAN.md Parsing ────────────────────────────────────────

const FULL_PLAN = `---
task: T01
slice: S01
milestone: M001
status: in_progress
---

## Goal
Implement authentication module with JWT token support

## Context
_Injected by orchestrator at execution time._

## Steps
1. [RED] Write failing tests for token generation
2. [GREEN] Implement token generation
3. [REFACTOR] Clean up implementation
4. [VERIFY] Run full test suite

## Must-Haves
### Truths
- Login returns JWT token
- Tokens expire after 1 hour

### Artifacts
- src/auth.ts — JWT authentication module (30+ lines) [exports: generateToken, verifyToken]
- src/middleware.ts — Auth middleware (20+ lines) [exports: authMiddleware]

### Key Links
- src/route.ts imports generateToken from ./auth
- src/middleware.ts imports verifyToken from ./auth

## Must-NOT-Haves
- No hardcoded secrets
- No synchronous token verification

## TDD Sequence
- Test file(s) to create: src/auth.test.ts, src/middleware.test.ts
- Test cases to write first: generates valid JWT, rejects expired token, middleware blocks unauthenticated
- Implementation file(s): src/auth.ts, src/middleware.ts
`;

describe("parseTaskPlan", () => {
  // ─── Frontmatter ─────────────────────────────────────────────

  test("parses frontmatter fields", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.task).toBe("T01");
    expect(plan.slice).toBe("S01");
    expect(plan.milestone).toBe("M001");
    expect(plan.status).toBe("in_progress");
  });

  // ─── Goal ────────────────────────────────────────────────────

  test("parses goal section", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.goal).toBe("Implement authentication module with JWT token support");
  });

  // ─── Steps ───────────────────────────────────────────────────

  test("parses steps as ordered list", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0]).toContain("[RED]");
    expect(plan.steps[3]).toContain("[VERIFY]");
  });

  // ─── Must-Haves: Truths ──────────────────────────────────────

  test("parses truths from Must-Haves section", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.mustHaves.truths).toHaveLength(2);
    expect(plan.mustHaves.truths[0]).toBe("Login returns JWT token");
    expect(plan.mustHaves.truths[1]).toBe("Tokens expire after 1 hour");
  });

  // ─── Must-Haves: Artifacts ──────────────────────────────────

  test("parses artifacts with path, description, minLines, exports", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.mustHaves.artifacts).toHaveLength(2);

    const auth = plan.mustHaves.artifacts[0];
    expect(auth.path).toBe("src/auth.ts");
    expect(auth.description).toBe("JWT authentication module");
    expect(auth.minLines).toBe(30);
    expect(auth.requiredExports).toEqual(["generateToken", "verifyToken"]);

    const mw = plan.mustHaves.artifacts[1];
    expect(mw.path).toBe("src/middleware.ts");
    expect(mw.description).toBe("Auth middleware");
    expect(mw.minLines).toBe(20);
    expect(mw.requiredExports).toEqual(["authMiddleware"]);
  });

  // ─── Must-Haves: Key Links ──────────────────────────────────

  test("parses key links as raw strings", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.mustHaves.keyLinks).toHaveLength(2);
    expect(plan.mustHaves.keyLinks[0]).toBe("src/route.ts imports generateToken from ./auth");
    expect(plan.mustHaves.keyLinks[1]).toBe("src/middleware.ts imports verifyToken from ./auth");
  });

  // ─── Must-NOT-Haves ─────────────────────────────────────────

  test("parses must-not-haves", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.mustNotHaves).toHaveLength(2);
    expect(plan.mustNotHaves[0]).toBe("No hardcoded secrets");
  });

  // ─── TDD Sequence ────────────────────────────────────────────

  test("parses TDD sequence test files", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.tddSequence.testFiles).toEqual([
      "src/auth.test.ts",
      "src/middleware.test.ts",
    ]);
  });

  test("parses TDD sequence test cases", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.tddSequence.testCases).toEqual([
      "generates valid JWT",
      "rejects expired token",
      "middleware blocks unauthenticated",
    ]);
  });

  test("parses TDD sequence implementation files", () => {
    const plan = parseTaskPlan(FULL_PLAN);
    expect(plan.tddSequence.implementationFiles).toEqual([
      "src/auth.ts",
      "src/middleware.ts",
    ]);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────

describe("parseTaskPlan edge cases", () => {
  test("handles placeholder/TBD values gracefully", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Some goal

## Steps
1. [RED] Write tests

## Must-Haves
### Truths
- _To be defined_

### Artifacts
- _To be defined_

### Key Links
- _To be defined_

## Must-NOT-Haves
- _To be defined_

## TDD Sequence
- Test file(s) to create: _TBD_
- Test cases to write first: _TBD_
- Implementation file(s): _TBD_
`);

    expect(plan.mustHaves.truths).toHaveLength(0);
    expect(plan.mustHaves.artifacts).toHaveLength(0);
    expect(plan.mustHaves.keyLinks).toHaveLength(0);
    expect(plan.mustNotHaves).toHaveLength(0);
    expect(plan.tddSequence.testFiles).toHaveLength(0);
    expect(plan.tddSequence.testCases).toHaveLength(0);
    expect(plan.tddSequence.implementationFiles).toHaveLength(0);
  });

  test("handles artifact without minLines", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Goal

## Must-Haves
### Artifacts
- src/utils.ts — Helper utilities [exports: formatDate]
`);

    expect(plan.mustHaves.artifacts).toHaveLength(1);
    expect(plan.mustHaves.artifacts[0].path).toBe("src/utils.ts");
    expect(plan.mustHaves.artifacts[0].description).toBe("Helper utilities");
    expect(plan.mustHaves.artifacts[0].minLines).toBe(0);
    expect(plan.mustHaves.artifacts[0].requiredExports).toEqual(["formatDate"]);
  });

  test("handles artifact without exports", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Goal

## Must-Haves
### Artifacts
- src/config.json — Configuration file (10+ lines)
`);

    expect(plan.mustHaves.artifacts).toHaveLength(1);
    expect(plan.mustHaves.artifacts[0].path).toBe("src/config.json");
    expect(plan.mustHaves.artifacts[0].minLines).toBe(10);
    expect(plan.mustHaves.artifacts[0].requiredExports).toEqual([]);
  });

  test("handles artifact with only path and description", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Goal

## Must-Haves
### Artifacts
- src/readme.md — Project readme
`);

    expect(plan.mustHaves.artifacts).toHaveLength(1);
    expect(plan.mustHaves.artifacts[0].path).toBe("src/readme.md");
    expect(plan.mustHaves.artifacts[0].description).toBe("Project readme");
    expect(plan.mustHaves.artifacts[0].minLines).toBe(0);
    expect(plan.mustHaves.artifacts[0].requiredExports).toEqual([]);
  });

  test("handles missing sections gracefully", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Minimal plan
`);

    expect(plan.goal).toBe("Minimal plan");
    expect(plan.steps).toHaveLength(0);
    expect(plan.mustHaves.truths).toHaveLength(0);
    expect(plan.mustHaves.artifacts).toHaveLength(0);
    expect(plan.mustHaves.keyLinks).toHaveLength(0);
    expect(plan.mustNotHaves).toHaveLength(0);
    expect(plan.tddSequence.testFiles).toHaveLength(0);
  });

  test("handles single test file in TDD sequence", () => {
    const plan = parseTaskPlan(`---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Goal

## TDD Sequence
- Test file(s) to create: src/one.test.ts
- Test cases to write first: does the thing
- Implementation file(s): src/one.ts
`);

    expect(plan.tddSequence.testFiles).toEqual(["src/one.test.ts"]);
    expect(plan.tddSequence.testCases).toEqual(["does the thing"]);
    expect(plan.tddSequence.implementationFiles).toEqual(["src/one.ts"]);
  });

  test("handles missing frontmatter gracefully", () => {
    const plan = parseTaskPlan(`## Goal
No frontmatter plan

## TDD Sequence
- Test file(s) to create: src/test.test.ts
- Implementation file(s): src/test.ts
`);

    expect(plan.task).toBe("");
    expect(plan.slice).toBe("");
    expect(plan.milestone).toBe("");
    expect(plan.status).toBe("pending");
    expect(plan.goal).toBe("No frontmatter plan");
    expect(plan.tddSequence.testFiles).toEqual(["src/test.test.ts"]);
  });

  test("strips parenthetical annotations from file paths", () => {
    const plan = parseTaskPlan(`## Goal
Extend existing tests

## TDD Sequence
- Test file(s): playground/src/routes/cards.test.ts (extend existing)
- Implementation file(s): playground/src/routes/cards.ts, playground/src/routes/boards.ts
`);

    expect(plan.tddSequence.testFiles).toEqual(["playground/src/routes/cards.test.ts"]);
    expect(plan.tddSequence.implementationFiles).toEqual([
      "playground/src/routes/cards.ts",
      "playground/src/routes/boards.ts",
    ]);
  });
});
