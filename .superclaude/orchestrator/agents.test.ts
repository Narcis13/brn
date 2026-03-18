import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  buildAgentPrompt,
  buildScopeGuard,
  parseAgentOutput,
  parseReviewOutput,
  getAgentDefinition,
  getVaultDocsForAgent,
  buildReviewPrompt,
} from "./agents.ts";
import type { AgentRole, ContextPayload, ReviewPersona } from "./types.ts";
import { AGENT_DEFINITIONS, REVIEW_PERSONAS } from "./types.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-agents";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/architect`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/reviewer`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/patterns`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/architecture`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/decisions`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/testing`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/vault/learnings`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── getAgentDefinition ────────────────────────────────────────

describe("getAgentDefinition", () => {
  test("returns definition for each known agent", () => {
    const roles: AgentRole[] = [
      "architect", "implementer", "tester", "reviewer",
      "researcher", "doctor", "scribe", "evolver",
    ];

    for (const role of roles) {
      const def = getAgentDefinition(role);
      expect(def.role).toBe(role);
      expect(def.skillPath).toContain(role);
      expect(def.vaultAccess.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test("all 8 agent definitions exist", () => {
    expect(Object.keys(AGENT_DEFINITIONS)).toHaveLength(8);
  });
});

// ─── buildScopeGuard ───────────────────────────────────────────

describe("buildScopeGuard", () => {
  test("architect scope guard prevents implementation", () => {
    const guard = buildScopeGuard("architect");
    expect(guard.some((g) => g.includes("DO NOT"))).toBe(true);
    expect(guard.some((g) => g.toLowerCase().includes("implement"))).toBe(true);
  });

  test("implementer scope guard restricts to task files", () => {
    const guard = buildScopeGuard("implementer");
    expect(guard.some((g) => g.toLowerCase().includes("task"))).toBe(true);
  });

  test("reviewer scope guard prevents code modification", () => {
    const guard = buildScopeGuard("reviewer");
    expect(guard.some((g) => g.toLowerCase().includes("modify") || g.toLowerCase().includes("change"))).toBe(true);
  });

  test("researcher scope guard prevents implementation", () => {
    const guard = buildScopeGuard("researcher");
    expect(guard.some((g) => g.toLowerCase().includes("implement"))).toBe(true);
  });

  test("doctor scope guard requires diagnosis before changes", () => {
    const guard = buildScopeGuard("doctor");
    expect(guard.some((g) => g.toLowerCase().includes("diagnos"))).toBe(true);
  });

  test("scribe scope guard prevents code changes", () => {
    const guard = buildScopeGuard("scribe");
    expect(guard.some((g) => g.toLowerCase().includes("code"))).toBe(true);
  });

  test("evolver scope guard requires human approval for critical docs", () => {
    const guard = buildScopeGuard("evolver");
    expect(guard.some((g) => g.toLowerCase().includes("human") || g.toLowerCase().includes("approval"))).toBe(true);
  });

  test("tester scope guard prevents implementation", () => {
    const guard = buildScopeGuard("tester");
    expect(guard.some((g) => g.toLowerCase().includes("implement"))).toBe(true);
  });
});

// ─── getVaultDocsForAgent ──────────────────────────────────────

describe("getVaultDocsForAgent", () => {
  test("loads vault docs matching agent's access list", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/patterns/typescript.md`,
      "---\ntitle: TypeScript Patterns\n---\n\nUse strict types."
    );
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/architecture/overview.md`,
      "---\ntitle: Architecture Overview\n---\n\nTwo-layer system."
    );

    const docs = await getVaultDocsForAgent(TEST_ROOT, "architect");
    // architect has access to architecture/ and patterns/
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some((d) => d.includes("TypeScript Patterns") || d.includes("strict types"))).toBe(true);
    expect(docs.some((d) => d.includes("Architecture Overview") || d.includes("Two-layer"))).toBe(true);
  });

  test("does not load docs outside agent's access list", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/vault/testing/strategy.md`,
      "---\ntitle: Testing Strategy\n---\n\nTDD enforced."
    );

    // researcher only has access to architecture/
    const docs = await getVaultDocsForAgent(TEST_ROOT, "researcher");
    expect(docs.every((d) => !d.includes("Testing Strategy"))).toBe(true);
  });

  test("returns empty array when vault dirs don't exist", async () => {
    const docs = await getVaultDocsForAgent("/tmp/nonexistent-root", "architect");
    expect(docs).toEqual([]);
  });
});

// ─── buildAgentPrompt ──────────────────────────────────────────

describe("buildAgentPrompt", () => {
  test("includes agent role header", () => {
    const ctx: ContextPayload = {
      taskPlan: "Plan the auth slice",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: ["## Patterns\nUse strict types"],
      boundaryContracts: [],
    };

    const prompt = buildAgentPrompt("architect", ctx, []);
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("System design");
  });

  test("includes task context", () => {
    const ctx: ContextPayload = {
      taskPlan: "Implement JWT generation",
      codeFiles: { "src/auth.ts": "export function gen() {}" },
      upstreamSummaries: ["T01 completed types"],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = buildAgentPrompt("implementer", ctx, []);
    expect(prompt).toContain("Implement JWT generation");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("T01 completed types");
  });

  test("includes scope guard", () => {
    const ctx: ContextPayload = {
      taskPlan: "Review auth code",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = buildAgentPrompt("reviewer", ctx, []);
    expect(prompt).toContain("Scope Guard");
    expect(prompt).toContain("DO NOT");
  });

  test("includes vault docs when provided", () => {
    const ctx: ContextPayload = {
      taskPlan: "Scout codebase",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: ["## Architecture\nTwo-layer system with orchestrator."],
      boundaryContracts: [],
    };

    const prompt = buildAgentPrompt("researcher", ctx, []);
    expect(prompt).toContain("Two-layer system");
  });

  test("includes additional instructions when provided", () => {
    const ctx: ContextPayload = {
      taskPlan: "Debug test failure",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = buildAgentPrompt("doctor", ctx, ["Focus on auth.test.ts failure"]);
    expect(prompt).toContain("Focus on auth.test.ts failure");
  });
});

// ─── parseAgentOutput ──────────────────────────────────────────

describe("parseAgentOutput", () => {
  test("parses successful agent output", () => {
    const raw = `---
agent: architect
status: success
---

## Design
Interface contracts defined for auth module.

## Boundary Map
S01 produces: generateToken(), verifyToken()`;

    const result = parseAgentOutput("architect", raw);
    expect(result.success).toBe(true);
    expect(result.agent).toBe("architect");
    expect(result.content).toContain("Interface contracts");
    expect(result.content).toContain("Boundary Map");
  });

  test("parses output with no frontmatter as success", () => {
    const raw = `## Summary
Everything looks good. No issues found.`;

    const result = parseAgentOutput("scribe", raw);
    expect(result.success).toBe(true);
    expect(result.agent).toBe("scribe");
    expect(result.content).toContain("Everything looks good");
  });

  test("handles empty output as failure", () => {
    const result = parseAgentOutput("doctor", "");
    expect(result.success).toBe(false);
  });

  test("handles error output", () => {
    const raw = `---
agent: implementer
status: error
---

## Error
Could not find test files.`;

    const result = parseAgentOutput("implementer", raw);
    expect(result.success).toBe(false);
    expect(result.content).toContain("Could not find test files");
  });
});

// ─── parseReviewOutput ─────────────────────────────────────────

describe("parseReviewOutput", () => {
  test("parses review with MUST-FIX issues", () => {
    const raw = `## Correctness Review

### Issues

**MUST-FIX** | src/auth.ts:15 | Missing null check on token parameter
Suggestion: Add null guard before calling verify()

**SHOULD-FIX** | src/auth.ts:30 | Magic number 3600 should be a named constant
Suggestion: Extract to TOKEN_EXPIRY_SECONDS constant

### Summary
Auth module has one critical issue and one style concern.`;

    const result = parseReviewOutput("correctness", raw);
    expect(result.persona).toBe("correctness");
    expect(result.issues.length).toBe(2);
    expect(result.issues[0]!.severity).toBe("MUST-FIX");
    expect(result.issues[0]!.file).toBe("src/auth.ts");
    expect(result.issues[0]!.line).toBe(15);
    expect(result.issues[0]!.description).toContain("null check");
    expect(result.issues[1]!.severity).toBe("SHOULD-FIX");
    expect(result.summary).toContain("critical issue");
  });

  test("parses review with no issues", () => {
    const raw = `## TypeScript Review

### Issues

None found.

### Summary
All types are correct, no any types detected.`;

    const result = parseReviewOutput("typescript", raw);
    expect(result.persona).toBe("typescript");
    expect(result.issues).toHaveLength(0);
    expect(result.summary).toContain("All types");
  });

  test("parses CONSIDER severity", () => {
    const raw = `## Performance Review

### Issues

**CONSIDER** | src/query.ts:42 | Could cache this database query result
Suggestion: Add a simple TTL cache for frequently accessed data

### Summary
No critical performance issues.`;

    const result = parseReviewOutput("performance", raw);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]!.severity).toBe("CONSIDER");
    expect(result.issues[0]!.persona).toBe("performance");
  });

  test("parses multiple issues from same file", () => {
    const raw = `## Security Review

### Issues

**MUST-FIX** | src/login.ts:5 | SQL injection via unsanitized input
Suggestion: Use parameterized queries

**MUST-FIX** | src/login.ts:20 | Password logged in plaintext
Suggestion: Remove logging of credentials

### Summary
Two critical security vulnerabilities found.`;

    const result = parseReviewOutput("security", raw);
    expect(result.issues.length).toBe(2);
    expect(result.issues.every((i) => i.file === "src/login.ts")).toBe(true);
    expect(result.issues.every((i) => i.severity === "MUST-FIX")).toBe(true);
  });

  test("handles issues without file:line", () => {
    const raw = `## Architecture Review

### Issues

**SHOULD-FIX** | General | Too many responsibilities in AuthService class
Suggestion: Split into TokenService and SessionService

### Summary
Moderate coupling concern.`;

    const result = parseReviewOutput("architecture", raw);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]!.file).toBeNull();
    expect(result.issues[0]!.line).toBeNull();
    expect(result.issues[0]!.description).toContain("responsibilities");
  });
});

// ─── buildReviewPrompt ─────────────────────────────────────────

describe("buildReviewPrompt", () => {
  test("generates persona-specific review prompt", () => {
    const ctx: ContextPayload = {
      taskPlan: "Review auth implementation",
      codeFiles: { "src/auth.ts": "export function gen() { return 'tok'; }" },
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = buildReviewPrompt("correctness", ctx);
    expect(prompt).toContain("Correctness");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("MUST-FIX");
    expect(prompt).toContain("SHOULD-FIX");
    expect(prompt).toContain("CONSIDER");
  });

  test("each persona gets unique review focus", () => {
    const ctx: ContextPayload = {
      taskPlan: "Review code",
      codeFiles: { "src/app.ts": "const x = 1;" },
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompts: Record<string, string> = {};
    for (const persona of REVIEW_PERSONAS) {
      prompts[persona] = buildReviewPrompt(persona, ctx);
    }

    // Each persona should have unique focus areas
    expect(prompts["correctness"]).toContain("edge case");
    expect(prompts["architecture"]).toContain("abstraction");
    expect(prompts["typescript"]).toContain("type");
    expect(prompts["performance"]).toContain("N+1");
    expect(prompts["security"]).toContain("injection");
    expect(prompts["testability"]).toContain("test");
  });

  test("review prompt includes output format", () => {
    const ctx: ContextPayload = {
      taskPlan: "Review",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = buildReviewPrompt("security", ctx);
    expect(prompt).toContain("### Issues");
    expect(prompt).toContain("### Summary");
  });

  test("all 6 review personas are defined", () => {
    expect(REVIEW_PERSONAS).toHaveLength(6);
    expect(REVIEW_PERSONAS).toContain("correctness");
    expect(REVIEW_PERSONAS).toContain("architecture");
    expect(REVIEW_PERSONAS).toContain("typescript");
    expect(REVIEW_PERSONAS).toContain("performance");
    expect(REVIEW_PERSONAS).toContain("security");
    expect(REVIEW_PERSONAS).toContain("testability");
  });
});
