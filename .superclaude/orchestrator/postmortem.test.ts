import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createPostmortem,
  generatePostmortemMarkdown,
  writePostmortem,
  loadPostmortem,
  listPostmortems,
  updatePostmortemStatus,
  nextPostmortemId,
} from "./postmortem.ts";
import type { PostmortemReport, PostmortemFix } from "./types.ts";

const TEST_ROOT = "/tmp/superclaude-test-postmortem";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/history/postmortems`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── createPostmortem ────────────────────────────────────────────

test("createPostmortem builds a PostmortemReport with proposed status", () => {
  const pm = createPostmortem({
    id: "PM-001",
    session: "2026-03-17-night",
    failure: {
      what: "Agent produced code with implicit any types",
      when: "M001/S01/T03 GREEN phase",
      impact: "TypeScript strict mode failed, required manual fix",
    },
    rootCause: {
      contextPresent: ["patterns/typescript.md"],
      contextMissing: ["Explicit examples of strict-mode violations"],
      unclearDoc: "patterns/typescript.md",
      ambiguousSkill: null,
      missingTest: "Type-checking verification step in TDD",
      missingVerification: "tsc --noEmit check after GREEN phase",
    },
    proposedFixes: [
      {
        type: "vault-doc",
        target: "vault/patterns/typescript.md",
        description: "Add explicit no-any examples",
        before: null,
        after: "## Anti-Patterns\n- Never use `any`",
        reason: "Agent needs concrete examples of what strict mode rejects",
      },
    ],
    severity: {
      frequency: "frequent",
      impact: "moderate",
      effort: "trivial",
      recommendation: "fix-now",
    },
  });

  expect(pm.id).toBe("PM-001");
  expect(pm.status).toBe("proposed");
  expect(pm.timestamp).toBeTruthy();
  expect(pm.session).toBe("2026-03-17-night");
  expect(pm.failure.what).toContain("implicit any");
  expect(pm.proposedFixes).toHaveLength(1);
  expect(pm.severity.recommendation).toBe("fix-now");
});

// ─── generatePostmortemMarkdown ──────────────────────────────────

test("generatePostmortemMarkdown produces structured markdown", () => {
  const pm = createPostmortem({
    id: "PM-002",
    session: "test-session",
    failure: {
      what: "Tests passed in GREEN but failed in VERIFY",
      when: "M001/S02/T01",
      impact: "Wasted one retry cycle",
    },
    rootCause: {
      contextPresent: [],
      contextMissing: ["Full test suite from upstream slices"],
      unclearDoc: null,
      ambiguousSkill: "implementer",
      missingTest: "Regression test for shared util",
      missingVerification: null,
    },
    proposedFixes: [
      {
        type: "test-pattern",
        target: "vault/testing/strategy.md",
        description: "Add regression test requirement for shared utilities",
        before: null,
        after: null,
        reason: "Shared utils need upstream regression coverage",
      },
      {
        type: "skill-instruction",
        target: "skills/implementer/SKILL.md",
        description: "Add instruction to check upstream tests before GREEN phase",
        before: null,
        after: null,
        reason: "Agent should be aware of upstream dependencies",
      },
    ],
    severity: {
      frequency: "occasional",
      impact: "minor",
      effort: "moderate",
      recommendation: "fix-soon",
    },
  });

  const md = generatePostmortemMarkdown(pm);

  // Frontmatter
  expect(md).toContain("---");
  expect(md).toContain("id: PM-002");
  expect(md).toContain("status: proposed");

  // Sections
  expect(md).toContain("## Failure");
  expect(md).toContain("## Root Cause Analysis");
  expect(md).toContain("## Proposed System Fixes");
  expect(md).toContain("## Priority");

  // Content
  expect(md).toContain("Tests passed in GREEN but failed in VERIFY");
  expect(md).toContain("Full test suite from upstream slices");
  expect(md).toContain("test-pattern");
  expect(md).toContain("occasional");
});

// ─── Persistence roundtrip ──────────────────────────────────────

test("writePostmortem and loadPostmortem roundtrip", async () => {
  const pm = createPostmortem({
    id: "PM-003",
    session: "roundtrip-test",
    failure: { what: "Test failure", when: "S01/T01", impact: "Minor" },
    rootCause: {
      contextPresent: [],
      contextMissing: [],
      unclearDoc: null,
      ambiguousSkill: null,
      missingTest: null,
      missingVerification: null,
    },
    proposedFixes: [],
    severity: {
      frequency: "rare",
      impact: "minor",
      effort: "trivial",
      recommendation: "defer",
    },
  });

  await writePostmortem(TEST_ROOT, pm);
  const loaded = await loadPostmortem(TEST_ROOT, "PM-003");

  expect(loaded).not.toBeNull();
  expect(loaded!.id).toBe("PM-003");
  expect(loaded!.session).toBe("roundtrip-test");
  expect(loaded!.status).toBe("proposed");
  expect(loaded!.failure.what).toBe("Test failure");
});

// ─── listPostmortems ────────────────────────────────────────────

test("listPostmortems returns all postmortem IDs", async () => {
  const pm1 = createPostmortem({
    id: "PM-001",
    session: "s1",
    failure: { what: "f1", when: "t1", impact: "i1" },
    rootCause: { contextPresent: [], contextMissing: [], unclearDoc: null, ambiguousSkill: null, missingTest: null, missingVerification: null },
    proposedFixes: [],
    severity: { frequency: "rare", impact: "minor", effort: "trivial", recommendation: "defer" },
  });
  const pm2 = createPostmortem({
    id: "PM-002",
    session: "s2",
    failure: { what: "f2", when: "t2", impact: "i2" },
    rootCause: { contextPresent: [], contextMissing: [], unclearDoc: null, ambiguousSkill: null, missingTest: null, missingVerification: null },
    proposedFixes: [],
    severity: { frequency: "rare", impact: "minor", effort: "trivial", recommendation: "defer" },
  });

  await writePostmortem(TEST_ROOT, pm1);
  await writePostmortem(TEST_ROOT, pm2);

  const ids = await listPostmortems(TEST_ROOT);
  expect(ids).toContain("PM-001");
  expect(ids).toContain("PM-002");
  expect(ids).toHaveLength(2);
});

// ─── updatePostmortemStatus ─────────────────────────────────────

test("updatePostmortemStatus changes status and persists", async () => {
  const pm = createPostmortem({
    id: "PM-004",
    session: "status-test",
    failure: { what: "err", when: "t", impact: "i" },
    rootCause: { contextPresent: [], contextMissing: [], unclearDoc: null, ambiguousSkill: null, missingTest: null, missingVerification: null },
    proposedFixes: [],
    severity: { frequency: "rare", impact: "minor", effort: "trivial", recommendation: "defer" },
  });

  await writePostmortem(TEST_ROOT, pm);
  await updatePostmortemStatus(TEST_ROOT, "PM-004", "approved");

  const loaded = await loadPostmortem(TEST_ROOT, "PM-004");
  expect(loaded!.status).toBe("approved");
});

// ─── nextPostmortemId ───────────────────────────────────────────

test("nextPostmortemId returns PM-001 when no postmortems exist", async () => {
  const id = await nextPostmortemId(TEST_ROOT);
  expect(id).toBe("PM-001");
});

test("nextPostmortemId increments based on existing postmortems", async () => {
  const pm = createPostmortem({
    id: "PM-003",
    session: "s",
    failure: { what: "f", when: "t", impact: "i" },
    rootCause: { contextPresent: [], contextMissing: [], unclearDoc: null, ambiguousSkill: null, missingTest: null, missingVerification: null },
    proposedFixes: [],
    severity: { frequency: "rare", impact: "minor", effort: "trivial", recommendation: "defer" },
  });
  await writePostmortem(TEST_ROOT, pm);

  const id = await nextPostmortemId(TEST_ROOT);
  expect(id).toBe("PM-004");
});
