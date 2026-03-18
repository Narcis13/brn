import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import {
  createProposal,
  writeProposal,
  loadProposal,
  listProposals,
  approveProposal,
  rejectProposal,
  applyProposal,
  generateEvolverReport,
  runPostmortemAnalysis,
} from "./evolver.ts";
import type { PostmortemFix, PostmortemReport, EvolverProposal } from "./types.ts";
import { createPostmortem, writePostmortem } from "./postmortem.ts";

const TEST_ROOT = "/tmp/superclaude-test-evolver";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/history/postmortems`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/learnings`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/patterns`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/testing`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/architecture`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/decisions`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/playbooks`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/contracts`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/history/proposals`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── createProposal ─────────────────────────────────────────────

test("createProposal builds a pending EvolverProposal", () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "vault/patterns/typescript.md",
    description: "Add strict-mode examples",
    before: null,
    after: "## Anti-Patterns\n- Never use any",
    reason: "Agent needs concrete examples",
  };

  const proposal = createProposal("EVO-001", "PM-001", fix);
  expect(proposal.id).toBe("EVO-001");
  expect(proposal.postmortemId).toBe("PM-001");
  expect(proposal.status).toBe("pending");
  expect(proposal.fix.type).toBe("vault-doc");
  expect(proposal.timestamp).toBeTruthy();
  expect(proposal.reviewNotes).toBeNull();
  expect(proposal.appliedAt).toBeNull();
});

// ─── Proposal persistence ───────────────────────────────────────

test("writeProposal and loadProposal roundtrip", async () => {
  const fix: PostmortemFix = {
    type: "test-pattern",
    target: "vault/testing/strategy.md",
    description: "Add regression test rule",
    before: null,
    after: null,
    reason: "Prevent upstream breakage",
  };

  const proposal = createProposal("EVO-002", "PM-002", fix);
  await writeProposal(TEST_ROOT, proposal);

  const loaded = await loadProposal(TEST_ROOT, "EVO-002");
  expect(loaded).not.toBeNull();
  expect(loaded!.id).toBe("EVO-002");
  expect(loaded!.postmortemId).toBe("PM-002");
  expect(loaded!.status).toBe("pending");
});

// ─── listProposals ──────────────────────────────────────────────

test("listProposals returns all proposal IDs", async () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "target",
    description: "desc",
    before: null,
    after: null,
    reason: "reason",
  };

  await writeProposal(TEST_ROOT, createProposal("EVO-001", "PM-001", fix));
  await writeProposal(TEST_ROOT, createProposal("EVO-002", "PM-001", fix));

  const ids = await listProposals(TEST_ROOT);
  expect(ids).toContain("EVO-001");
  expect(ids).toContain("EVO-002");
  expect(ids).toHaveLength(2);
});

// ─── approveProposal / rejectProposal ──────────────────────────

test("approveProposal changes status to approved with notes", async () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "t",
    description: "d",
    before: null,
    after: null,
    reason: "r",
  };

  const proposal = createProposal("EVO-003", "PM-001", fix);
  await writeProposal(TEST_ROOT, proposal);
  await approveProposal(TEST_ROOT, "EVO-003", "Looks good, apply it");

  const loaded = await loadProposal(TEST_ROOT, "EVO-003");
  expect(loaded!.status).toBe("approved");
  expect(loaded!.reviewNotes).toBe("Looks good, apply it");
});

test("rejectProposal changes status to rejected with notes", async () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "t",
    description: "d",
    before: null,
    after: null,
    reason: "r",
  };

  const proposal = createProposal("EVO-004", "PM-002", fix);
  await writeProposal(TEST_ROOT, proposal);
  await rejectProposal(TEST_ROOT, "EVO-004", "Not worth the complexity");

  const loaded = await loadProposal(TEST_ROOT, "EVO-004");
  expect(loaded!.status).toBe("rejected");
  expect(loaded!.reviewNotes).toBe("Not worth the complexity");
});

// ─── applyProposal ──────────────────────────────────────────────

test("applyProposal for vault-doc type writes a learning document", async () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "vault/learnings/L001-strict-types.md",
    description: "Document strict type lesson",
    before: null,
    after: "Always use explicit types, never any",
    reason: "Prevent implicit any in agent output",
  };

  const proposal = createProposal("EVO-005", "PM-001", fix);
  proposal.status = "approved";
  await writeProposal(TEST_ROOT, proposal);

  const result = await applyProposal(TEST_ROOT, "EVO-005");
  expect(result).toBe(true);

  const loaded = await loadProposal(TEST_ROOT, "EVO-005");
  expect(loaded!.status).toBe("applied");
  expect(loaded!.appliedAt).toBeTruthy();

  // Verify the vault doc was created
  const docFile = Bun.file(`${TEST_ROOT}/.superclaude/vault/learnings/L001-strict-types.md`);
  expect(await docFile.exists()).toBe(true);
  const content = await docFile.text();
  expect(content).toContain("strict type");
});

test("applyProposal rejects non-approved proposals", async () => {
  const fix: PostmortemFix = {
    type: "vault-doc",
    target: "vault/learnings/L002.md",
    description: "desc",
    before: null,
    after: null,
    reason: "reason",
  };

  const proposal = createProposal("EVO-006", "PM-001", fix);
  await writeProposal(TEST_ROOT, proposal);

  const result = await applyProposal(TEST_ROOT, "EVO-006");
  expect(result).toBe(false);
});

// ─── runPostmortemAnalysis ──────────────────────────────────────

test("runPostmortemAnalysis generates proposals from a postmortem", async () => {
  const pm = createPostmortem({
    id: "PM-010",
    session: "analysis-test",
    failure: { what: "Agent used any type", when: "S01/T01", impact: "Type errors" },
    rootCause: {
      contextPresent: [],
      contextMissing: ["strict mode examples"],
      unclearDoc: "patterns/typescript.md",
      ambiguousSkill: null,
      missingTest: "type-check verification",
      missingVerification: "tsc --noEmit",
    },
    proposedFixes: [
      {
        type: "vault-doc",
        target: "vault/learnings/L010.md",
        description: "Add strict mode learning",
        before: null,
        after: "Use explicit types",
        reason: "Prevent any types",
      },
      {
        type: "verification-check",
        target: "orchestrator/verify.ts",
        description: "Add tsc check",
        before: null,
        after: null,
        reason: "Catch type errors automatically",
      },
    ],
    severity: { frequency: "frequent", impact: "moderate", effort: "trivial", recommendation: "fix-now" },
  });

  await writePostmortem(TEST_ROOT, pm);
  const proposals = await runPostmortemAnalysis(TEST_ROOT, "PM-010");

  expect(proposals).toHaveLength(2);
  expect(proposals[0]!.postmortemId).toBe("PM-010");
  expect(proposals[1]!.postmortemId).toBe("PM-010");
  expect(proposals[0]!.status).toBe("pending");
});

// ─── generateEvolverReport ──────────────────────────────────────

test("generateEvolverReport produces markdown summary", () => {
  const report = generateEvolverReport({
    proposalsGenerated: 3,
    proposalsApplied: 2,
    vaultDocsUpdated: ["vault/learnings/L001.md", "vault/patterns/typescript.md"],
    skillsUpdated: [],
    newLearnings: ["Always check strict mode after GREEN phase"],
  });

  expect(report).toContain("## Evolver Report");
  expect(report).toContain("Proposals Generated: 3");
  expect(report).toContain("Proposals Applied: 2");
  expect(report).toContain("vault/learnings/L001.md");
  expect(report).toContain("Always check strict mode");
});
