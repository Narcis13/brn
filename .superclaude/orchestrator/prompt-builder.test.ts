import { test, expect, describe } from "bun:test";
import { buildPrompt } from "./prompt-builder.ts";
import type { ContextPayload, ProjectState } from "./types.ts";

// ─── Helper ─────────────────────────────────────────────────────

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    phase: "IDLE",
    tddSubPhase: null,
    currentMilestone: null,
    currentSlice: null,
    currentTask: null,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<ContextPayload> = {}): ContextPayload {
  return {
    taskPlan: "",
    codeFiles: {},
    upstreamSummaries: [],
    vaultDocs: [],
    boundaryContracts: [],
    ...overrides,
  };
}

// ─── Phase-specific prompt generation ───────────────────────────

describe("buildPrompt", () => {
  test("DISCUSS prompt contains architect role and gray areas format", () => {
    const state = makeState({ phase: "DISCUSS" });
    const ctx = makeContext({ taskPlan: "Build an auth system" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("DISCUSS");
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("gray areas");
    expect(prompt).toContain("Build an auth system");
  });

  test("RESEARCH prompt contains researcher role and pitfalls format", () => {
    const state = makeState({ phase: "RESEARCH" });
    const ctx = makeContext({
      taskPlan: "Research JWT handling",
      codeFiles: { "src/auth.ts": "export const x = 1;" },
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("RESEARCH");
    expect(prompt).toContain("Researcher");
    expect(prompt).toContain("Pitfall");
    expect(prompt).toContain("src/auth.ts");
  });

  test("PLAN_MILESTONE prompt contains slice decomposition instructions", () => {
    const state = makeState({ phase: "PLAN_MILESTONE" });
    const ctx = makeContext({ taskPlan: "Auth + Dashboard milestone" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("PLAN_MILESTONE");
    expect(prompt).toContain("demo sentence");
    expect(prompt).toContain("vertical");
  });

  test("PLAN_SLICE prompt includes boundary contracts", () => {
    const state = makeState({ phase: "PLAN_SLICE" });
    const ctx = makeContext({
      taskPlan: "Auth slice plan",
      boundaryContracts: ["S01 produces: generateToken()"],
      upstreamSummaries: ["S00 built the types"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("PLAN_SLICE");
    expect(prompt).toContain("generateToken");
    expect(prompt).toContain("S00 built the types");
  });

  test("EXECUTE_TASK IMPLEMENT prompt contains unified TDD instructions", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({
      taskPlan: "Write auth tests and implement",
      vaultDocs: ["## TypeScript patterns\nUse strict types"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("One-Shot");
    expect(prompt).toContain("Step 1: RED");
    expect(prompt).toContain("Step 2: GREEN");
    expect(prompt).toContain("Step 3: REFACTOR");
    expect(prompt).toContain("bun test");
    expect(prompt).toContain("TypeScript patterns");
    expect(prompt).toContain("Scope Guard");
  });

  test("COMPLETE_SLICE prompt generates summary and UAT", () => {
    const state = makeState({ phase: "COMPLETE_SLICE" });
    const ctx = makeContext({
      taskPlan: "Slice plan",
      upstreamSummaries: ["T01 built auth", "T02 built login"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("COMPLETE_SLICE");
    expect(prompt).toContain("SUMMARY");
    expect(prompt).toContain("UAT");
    expect(prompt).toContain("T01 built auth");
  });

  test("REASSESS prompt reviews roadmap after slice completion", () => {
    const state = makeState({ phase: "REASSESS" });
    const ctx = makeContext({
      taskPlan: "Current roadmap",
      upstreamSummaries: ["S01 completed auth"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("REASSESS");
    expect(prompt).toContain("roadmap");
    expect(prompt).toContain("S01 completed auth");
  });

  test("COMPLETE_MILESTONE prompt summarizes entire milestone", () => {
    const state = makeState({ phase: "COMPLETE_MILESTONE" });
    const ctx = makeContext({
      upstreamSummaries: ["S01 auth", "S02 dashboard"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("COMPLETE_MILESTONE");
    expect(prompt).toContain("S01 auth");
    expect(prompt).toContain("S02 dashboard");
  });

  test("EXECUTE_TASK with code files includes them in prompt", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({
      taskPlan: "Implement feature",
      codeFiles: {
        "src/auth.ts": "export function generateToken() {}",
        "src/types.ts": "export interface User { id: string; }",
      },
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("generateToken");
    expect(prompt).toContain("src/types.ts");
    expect(prompt).toContain("User");
  });

  test("EXECUTE_TASK tdd-strict prompt includes database test isolation instructions", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Implement repo with DB" });

    const prompt = buildPrompt(state, ctx, "tdd-strict");
    expect(prompt).toContain("Database Test Isolation");
    expect(prompt).toContain("beforeEach");
    expect(prompt).toContain("afterEach");
    expect(prompt).toContain("Never share database state");
  });

  test("EXECUTE_TASK test-after prompt includes database test isolation instructions", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Wire up routes" });

    const prompt = buildPrompt(state, ctx, "test-after");
    expect(prompt).toContain("Database Test Isolation");
    expect(prompt).toContain("Never share database state");
  });

  test("EXECUTE_TASK with test-after strategy uses implement-then-test prompt", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Wire up API routes" });

    const prompt = buildPrompt(state, ctx, "test-after");
    expect(prompt).toContain("Implement Then Test");
    expect(prompt).toContain("Step 1: IMPLEMENT");
    expect(prompt).toContain("Step 2: TEST");
    expect(prompt).not.toContain("Step 1: RED");
  });

  test("EXECUTE_TASK with verify-only strategy uses no-test prompt", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Set up database migrations" });

    const prompt = buildPrompt(state, ctx, "verify-only");
    expect(prompt).toContain("Implement and Verify");
    expect(prompt).toContain("verify-only");
    expect(prompt).not.toContain("Step 1: RED");
    expect(prompt).not.toContain("bun test");
    expect(prompt).toContain("tsc");
  });

  test("EXECUTE_TASK with tdd-strict strategy uses full TDD prompt (default)", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Implement auth service" });

    const prompt = buildPrompt(state, ctx, "tdd-strict");
    expect(prompt).toContain("One-Shot");
    expect(prompt).toContain("Step 1: RED");
    expect(prompt).toContain("Step 2: GREEN");
  });

  test("EXECUTE_TASK defaults to tdd-strict when no strategy provided", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT" });
    const ctx = makeContext({ taskPlan: "Implement auth service" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("One-Shot");
    expect(prompt).toContain("Step 1: RED");
  });

  test("PLAN_SLICE prompt includes verification strategy instructions", () => {
    const state = makeState({ phase: "PLAN_SLICE", currentMilestone: "M001", currentSlice: "S01" });
    const ctx = makeContext({ taskPlan: "Slice plan" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("tdd-strict");
    expect(prompt).toContain("test-after");
    expect(prompt).toContain("verify-only");
    expect(prompt).toContain("strategy");
  });

  test("PLAN_SLICE prompt includes complexity instructions", () => {
    const state = makeState({ phase: "PLAN_SLICE", currentMilestone: "M001", currentSlice: "S01" });
    const ctx = makeContext({ taskPlan: "Slice plan" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("complexity");
    expect(prompt).toContain("simple");
    expect(prompt).toContain("complex");
  });

  test("unknown phase returns fallback message", () => {
    const state = makeState({ phase: "IDLE" });
    const ctx = makeContext();

    const prompt = buildPrompt(state, ctx);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
