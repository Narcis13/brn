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
    expect(prompt).toContain("Gray Area");
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

  test("EXECUTE_TASK RED prompt focuses on test writing", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "RED" });
    const ctx = makeContext({
      taskPlan: "Write auth tests",
      vaultDocs: ["## TypeScript patterns\nUse strict types"],
    });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("RED");
    expect(prompt).toContain("Failing");
    expect(prompt).toContain("test");
    expect(prompt).toContain("MUST FAIL");
    expect(prompt).toContain("TypeScript patterns");
  });

  test("EXECUTE_TASK GREEN prompt focuses on implementation", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "GREEN" });
    const ctx = makeContext({ taskPlan: "Implement auth" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("GREEN");
    expect(prompt).toContain("MINIMUM");
  });

  test("EXECUTE_TASK REFACTOR prompt preserves test passing", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "REFACTOR" });
    const ctx = makeContext({ taskPlan: "Refactor auth" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("REFACTOR");
    expect(prompt).toContain("still pass");
  });

  test("EXECUTE_TASK VERIFY prompt runs comprehensive checks", () => {
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "VERIFY" });
    const ctx = makeContext({ taskPlan: "Verify auth task" });

    const prompt = buildPrompt(state, ctx);
    expect(prompt).toContain("VERIFY");
    expect(prompt).toContain("bun test");
    expect(prompt).toContain("tsc");
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
    const state = makeState({ phase: "EXECUTE_TASK", tddSubPhase: "GREEN" });
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

  test("unknown phase returns fallback message", () => {
    const state = makeState({ phase: "IDLE" });
    const ctx = makeContext();

    const prompt = buildPrompt(state, ctx);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
