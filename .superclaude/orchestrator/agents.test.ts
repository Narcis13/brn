import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  buildAgentPrompt,
  buildScopeGuard,
  loadSkillContent,
  parseAgentOutput,
  parseReviewOutput,
  parseDoctorOutput,
  parseArchitectOutput,
  parseResearcherOutput,
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
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/implementer`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/tester`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/reviewer`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/researcher`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/doctor`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/scribe`, { recursive: true });
  mkdirSync(`${TEST_ROOT}/.superclaude/skills/evolver`, { recursive: true });
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

// ─── loadSkillContent ─────────────────────────────────────────

describe("loadSkillContent", () => {
  test("loads and strips frontmatter from SKILL.md", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/skills/architect/SKILL.md`,
      "---\nname: architect\ndescription: System design agent\n---\n\n# Architect Agent\n\nYou design interfaces."
    );

    const content = await loadSkillContent(TEST_ROOT, "architect");
    expect(content).not.toBeNull();
    expect(content).toContain("# Architect Agent");
    expect(content).toContain("You design interfaces");
    // Frontmatter should be stripped
    expect(content).not.toContain("---");
    expect(content).not.toContain("name: architect");
  });

  test("returns null when SKILL.md does not exist", async () => {
    const content = await loadSkillContent("/tmp/nonexistent-root", "architect");
    expect(content).toBeNull();
  });

  test("handles SKILL.md with no frontmatter", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/skills/reviewer/SKILL.md`,
      "# Reviewer Agent\n\nReview code from multiple perspectives."
    );

    const content = await loadSkillContent(TEST_ROOT, "reviewer");
    expect(content).not.toBeNull();
    expect(content).toContain("# Reviewer Agent");
  });
});

// ─── buildAgentPrompt ──────────────────────────────────────────

describe("buildAgentPrompt", () => {
  test("includes agent role header", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Plan the auth slice",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: ["## Patterns\nUse strict types"],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("architect", ctx, []);
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("System design");
  });

  test("includes task context", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Implement JWT generation",
      codeFiles: { "src/auth.ts": "export function gen() {}" },
      upstreamSummaries: ["T01 completed types"],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("implementer", ctx, []);
    expect(prompt).toContain("Implement JWT generation");
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("T01 completed types");
  });

  test("includes scope guard", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Review auth code",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("reviewer", ctx, []);
    expect(prompt).toContain("Scope Guard");
    expect(prompt).toContain("DO NOT");
  });

  test("includes vault docs when provided", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Scout codebase",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: ["## Architecture\nTwo-layer system with orchestrator."],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("researcher", ctx, []);
    expect(prompt).toContain("Two-layer system");
  });

  test("includes additional instructions when provided", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Debug test failure",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("doctor", ctx, ["Focus on auth.test.ts failure"]);
    expect(prompt).toContain("Focus on auth.test.ts failure");
  });

  test("injects SKILL.md content when projectRoot is provided", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/skills/implementer/SKILL.md`,
      "---\nname: implementer\ndescription: TDD agent\n---\n\n# Implementer Agent\n\nYou write code following strict TDD.\n\n## Principles\n1. Tests come first."
    );

    const ctx: ContextPayload = {
      taskPlan: "Write auth tests",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("implementer", ctx, [], TEST_ROOT);
    expect(prompt).toContain("Skill Instructions");
    expect(prompt).toContain("Tests come first");
    expect(prompt).toContain("strict TDD");
    // Frontmatter should not leak into prompt
    expect(prompt).not.toContain("name: implementer");
  });

  test("works without projectRoot (no SKILL.md injection)", async () => {
    const ctx: ContextPayload = {
      taskPlan: "Do something",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("architect", ctx, []);
    expect(prompt).not.toContain("Skill Instructions");
    expect(prompt).toContain("Architect Agent");
  });

  test("skill content appears before task context in prompt", async () => {
    writeFileSync(
      `${TEST_ROOT}/.superclaude/skills/doctor/SKILL.md`,
      "---\nname: doctor\n---\n\n# Doctor Agent\n\nDiagnose before fixing."
    );

    const ctx: ContextPayload = {
      taskPlan: "Debug auth failure",
      codeFiles: {},
      upstreamSummaries: [],
      vaultDocs: [],
      boundaryContracts: [],
    };

    const prompt = await buildAgentPrompt("doctor", ctx, [], TEST_ROOT);
    const skillIdx = prompt.indexOf("Diagnose before fixing");
    const contextIdx = prompt.indexOf("Debug auth failure");
    expect(skillIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeLessThan(contextIdx);
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

// ─── parseDoctorOutput (GAP-19) ──────────────────────────────────

describe("parseDoctorOutput", () => {
  test("parses full diagnosis with all sections", () => {
    const raw = `---
agent: doctor
status: diagnosed
---

## Diagnosis
**Symptom:** Tests fail with "Cannot find module './auth'"
**Root cause:** Missing export in auth.ts — function defined but not exported
**Evidence:** auth.ts line 15 has \`function generateToken\` but no \`export\`

## Fix
**File(s):** src/auth.ts
**Change:** Add \`export\` keyword to generateToken function declaration
**Verification:** Run \`bun test src/auth.test.ts\` — should pass

## Prevention
**System fix:** Add export verification to static checks for all must-have artifacts`;

    const result = parseDoctorOutput(raw);
    expect(result.symptom).toContain("Cannot find module");
    expect(result.rootCause).toContain("Missing export");
    expect(result.evidence).toContain("auth.ts line 15");
    expect(result.fix).not.toBeNull();
    expect(result.fix!.files).toEqual(["src/auth.ts"]);
    expect(result.fix!.change).toContain("export");
    expect(result.fix!.verification).toContain("bun test");
    expect(result.prevention).toContain("export verification");
  });

  test("parses diagnosis with missing fix section", () => {
    const raw = `## Diagnosis
**Symptom:** Build timeout
**Root cause:** Infinite loop in recursive function
**Evidence:** Stack trace shows repeated calls to processNode()`;

    const result = parseDoctorOutput(raw);
    expect(result.symptom).toContain("Build timeout");
    expect(result.rootCause).toContain("Infinite loop");
    expect(result.fix).toBeNull();
  });

  test("handles empty input", () => {
    const result = parseDoctorOutput("");
    expect(result.symptom).toBe("");
    expect(result.rootCause).toBe("");
    expect(result.fix).toBeNull();
    expect(result.prevention).toBeNull();
  });

  test("parses multiple fix files", () => {
    const raw = `**Symptom:** Type error across modules
**Root cause:** Shared type changed without updating consumers
**Fix**
**File(s):** src/types.ts, src/auth.ts, src/middleware.ts
**Change:** Update UserSession type to include refreshToken field`;

    const result = parseDoctorOutput(raw);
    expect(result.fix).not.toBeNull();
    expect(result.fix!.files).toHaveLength(3);
    expect(result.fix!.files).toContain("src/types.ts");
    expect(result.fix!.files).toContain("src/auth.ts");
  });
});

// ─── parseArchitectOutput (GAP-19) ───────────────────────────────

describe("parseArchitectOutput", () => {
  test("parses slice definitions", () => {
    const raw = `## Slices

### S01: Authentication
**Demo:** After this, the user can log in with email and password
**Risk:** medium

### S02: Dashboard
**Demo:** After this, the user can see their personal dashboard
**Risk:** low`;

    const result = parseArchitectOutput(raw);
    expect(result.slices).toHaveLength(2);
    expect(result.slices[0]!.id).toBe("S01");
    expect(result.slices[0]!.name).toBe("Authentication");
    expect(result.slices[0]!.demoSentence).toContain("log in");
    expect(result.slices[0]!.risk).toBe("medium");
    expect(result.slices[1]!.id).toBe("S02");
    expect(result.slices[1]!.risk).toBe("low");
  });

  test("parses boundary map items", () => {
    const raw = `### S01: Auth

**Produces:**
- \`src/auth.ts\` → generateToken, verifyToken
- \`src/types/user.ts\` → User, Session

**Consumes from S00:**
- \`src/config.ts\` → getSecret`;

    const result = parseArchitectOutput(raw);
    expect(result.boundaryItems.length).toBeGreaterThanOrEqual(3);
    expect(result.boundaryItems.some(b => b.includes("generateToken"))).toBe(true);
    expect(result.boundaryItems.some(b => b.includes("getSecret"))).toBe(true);
  });

  test("handles empty input", () => {
    const result = parseArchitectOutput("");
    expect(result.slices).toHaveLength(0);
    expect(result.boundaryItems).toHaveLength(0);
  });
});

// ─── parseResearcherOutput (GAP-19) ──────────────────────────────

describe("parseResearcherOutput", () => {
  test("parses don't-hand-roll section", () => {
    const raw = `## Don't Hand-Roll
- **jose**: JWT validation and signing — handles algorithm confusion attacks and key rotation
- **zod**: Schema validation — more ergonomic than manual type guards

## Common Pitfalls
- **JWT Algorithm Confusion**: Attacker sends HS256 token to RS256 endpoint — use explicit algorithm whitelist`;

    const result = parseResearcherOutput(raw);
    expect(result.dontHandRoll).toHaveLength(2);
    expect(result.dontHandRoll[0]!.library).toBe("jose");
    expect(result.dontHandRoll[0]!.reason).toContain("algorithm confusion");
    expect(result.dontHandRoll[1]!.library).toBe("zod");
    expect(result.pitfalls).toHaveLength(1);
    expect(result.pitfalls[0]!.name).toBe("JWT Algorithm Confusion");
  });

  test("parses code locations section", () => {
    const raw = `## Relevant Code Locations
- \`src/lib/auth.ts\`: existing JWT helper, uses HS256
- \`src/middleware/index.ts\`: Express-style middleware chain`;

    const result = parseResearcherOutput(raw);
    expect(result.codeLocations).toHaveLength(2);
    expect(result.codeLocations[0]!.path).toBe("src/lib/auth.ts");
    expect(result.codeLocations[0]!.description).toContain("JWT helper");
  });

  test("parses patterns section", () => {
    const raw = `## Patterns to Follow
- Use barrel exports (index.ts) for each feature directory
- Error handling: always throw typed errors extending AppError`;

    const result = parseResearcherOutput(raw);
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns[0]).toContain("barrel exports");
  });

  test("handles empty input", () => {
    const result = parseResearcherOutput("");
    expect(result.dontHandRoll).toHaveLength(0);
    expect(result.pitfalls).toHaveLength(0);
    expect(result.codeLocations).toHaveLength(0);
    expect(result.patterns).toHaveLength(0);
  });

  test("handles missing sections", () => {
    const raw = `## Don't Hand-Roll
- **bcrypt**: Password hashing — never roll your own crypto`;

    const result = parseResearcherOutput(raw);
    expect(result.dontHandRoll).toHaveLength(1);
    expect(result.pitfalls).toHaveLength(0);
    expect(result.codeLocations).toHaveLength(0);
    expect(result.patterns).toHaveLength(0);
  });
});
