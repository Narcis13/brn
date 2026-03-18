/**
 * SUPER_CLAUDE — Main Orchestration Loop
 * The deterministic brain. Reads state → builds prompt → invokes Claude → updates state.
 *
 * Usage:
 *   bun run .superclaude/orchestrator/loop.ts --mode=auto
 *   bun run .superclaude/orchestrator/loop.ts --mode=step
 *   bun run .superclaude/orchestrator/loop.ts --mode=auto --budget=25.00
 *   bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001
 */

import { parseArgs, getProjectRoot } from "./config.ts";
import { readState, writeState, determineNextAction, advanceTDDPhase } from "./state.ts";
import { assembleContext } from "./context.ts";
import { buildPrompt } from "./prompt-builder.ts";
import { enforceTDDPhase } from "./tdd.ts";
import { verifyMustHaves } from "./verify.ts";
import type { OrchestratorConfig, ProjectState, TDDSequence, TaskPlan } from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs(Bun.argv.slice(2));
  const projectRoot = getProjectRoot();

  console.log(`[SUPER_CLAUDE] Starting orchestrator`);
  console.log(`  Mode: ${config.mode}`);
  console.log(`  Budget: $${config.budgetCeiling}`);
  console.log(`  Project: ${projectRoot}`);
  console.log();

  if (config.mode === "auto") {
    await runAutoLoop(projectRoot, config);
  } else if (config.mode === "step") {
    await runSingleStep(projectRoot, config);
  } else {
    console.log("[SUPER_CLAUDE] Interactive mode — use Claude Code directly.");
    console.log("  The orchestrator provides scaffolding and state management.");
    await printStatus(projectRoot);
  }
}

// ─── Auto Loop ───────────────────────────────────────────────────

async function runAutoLoop(projectRoot: string, config: OrchestratorConfig) {
  let totalCost = 0;
  let iterations = 0;
  const maxIterations = 100; // Safety valve

  while (iterations < maxIterations) {
    iterations++;

    // 1. Read state
    const state = await readState(projectRoot);
    console.log(`[${iterations}] Phase: ${state.phase} | TDD: ${state.tddSubPhase ?? "n/a"} | M:${state.currentMilestone ?? "-"} S:${state.currentSlice ?? "-"} T:${state.currentTask ?? "-"}`);

    // 2. Determine next action
    const nextAction = await determineNextAction(projectRoot, state);

    if (nextAction.phase === "IDLE" && nextAction.description.includes("waiting")) {
      console.log("[SUPER_CLAUDE] No more work to do. Stopping.");
      break;
    }

    // 3. Check budget
    if (totalCost >= config.budgetCeiling) {
      console.log(`[SUPER_CLAUDE] Budget exceeded ($${totalCost.toFixed(2)} / $${config.budgetCeiling}). Stopping.`);
      break;
    }

    // 4. Assemble context
    const context = await assembleContext(projectRoot, state);

    // 5. Generate prompt
    const prompt = buildPrompt(state, context);

    // 6. Invoke Claude headless
    console.log(`  Action: ${nextAction.description}`);
    const result = await invokeClaudeHeadless(prompt);

    if (!result.success) {
      console.error(`  ERROR: ${result.error}`);
      // Write CONTINUE.md and stop
      break;
    }

    // 7. TDD enforcement (only during EXECUTE_TASK)
    if (state.phase === "EXECUTE_TASK" && state.tddSubPhase) {
      const tddResult = await runTDDEnforcement(projectRoot, state);
      if (tddResult !== null && !tddResult.passed) {
        console.log(`  TDD FAIL: ${tddResult.message}`);
        // Don't advance state — retry this phase
        continue;
      }
      if (tddResult !== null) {
        console.log(`  TDD OK: ${tddResult.message}`);
      }
    }

    // 8. Static verification (during VERIFY sub-phase)
    if (state.phase === "EXECUTE_TASK" && state.tddSubPhase === "VERIFY") {
      const verifyResult = await runStaticVerification(projectRoot, state);
      if (verifyResult !== null && !verifyResult.passed) {
        const failures = verifyResult.checks.filter((c) => !c.passed);
        console.log(`  VERIFY FAIL: ${failures.length} check(s) failed`);
        for (const f of failures) {
          console.log(`    ✗ ${f.name}: ${f.message}`);
        }
        // Don't advance state — the agent needs to fix issues
        continue;
      }
      if (verifyResult !== null) {
        console.log(`  VERIFY OK: all ${verifyResult.checks.length} static checks passed`);
      }
    }

    // 9. Update state
    const newState = computeNextState(state, nextAction);
    await writeState(projectRoot, newState);

    // 10. Estimate cost (rough)
    const promptTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil((result.output?.length ?? 0) / 4);
    const stepCost = (promptTokens * 3 + outputTokens * 15) / 1_000_000; // Rough Opus pricing
    totalCost += stepCost;

    console.log(`  Cost: ~$${stepCost.toFixed(4)} (total: $${totalCost.toFixed(2)})`);
    console.log();

    // Step mode: stop after one iteration
    if (config.mode === "step") break;
  }

  console.log(`[SUPER_CLAUDE] Loop complete. ${iterations} iterations, ~$${totalCost.toFixed(2)} total.`);
}

// ─── Single Step ─────────────────────────────────────────────────

async function runSingleStep(projectRoot: string, config: OrchestratorConfig) {
  await runAutoLoop(projectRoot, { ...config, mode: "step" });
}

// ─── Claude Invocation ───────────────────────────────────────────

interface InvocationResult {
  success: boolean;
  output: string | null;
  error: string | null;
}

async function invokeClaudeHeadless(prompt: string): Promise<InvocationResult> {
  try {
    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/superclaude-prompt-${Date.now()}.md`;
    await Bun.write(tmpFile, prompt);

    const result =
      await Bun.$`claude -p "$(cat ${tmpFile})" --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1`
        .text()
        .catch((err: Error) => `ERROR: ${err.message}`);

    // Cleanup temp file
    await Bun.$`rm -f ${tmpFile}`.quiet();

    if (result.startsWith("ERROR:")) {
      return { success: false, output: null, error: result };
    }

    return { success: true, output: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: null, error: message };
  }
}

// ─── State Transitions ──────────────────────────────────────────

function computeNextState(
  current: ProjectState,
  action: { phase: string; tddSubPhase: string | null }
): ProjectState {
  const next = { ...current, lastUpdated: new Date().toISOString() };

  // If we're in EXECUTE_TASK, advance TDD sub-phase
  if (current.phase === "EXECUTE_TASK" && current.tddSubPhase) {
    const nextTDD = advanceTDDPhase(current.tddSubPhase);
    if (nextTDD === null) {
      // Task complete → move to next task or COMPLETE_SLICE
      next.tddSubPhase = null;
      // For now, advance to COMPLETE_SLICE. The full implementation would
      // check if there are more tasks in the slice.
      next.phase = "COMPLETE_SLICE";
    } else {
      next.tddSubPhase = nextTDD;
    }
  }

  return next;
}

// ─── TDD & Verification Helpers ─────────────────────────────────

async function loadTaskPlan(
  projectRoot: string,
  state: ProjectState
): Promise<TaskPlan | null> {
  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;
  if (!m || !s || !t) return null;

  const planPath = `${projectRoot}/${PATHS.taskPath(m, s, t)}/PLAN.md`;
  const file = Bun.file(planPath);
  if (!(await file.exists())) return null;

  // Return a minimal TaskPlan with TDD sequence extracted from the plan
  // In a full implementation, this would parse the PLAN.md frontmatter and body
  return {
    task: t,
    slice: s,
    milestone: m,
    status: "in_progress",
    goal: "",
    steps: [],
    mustHaves: { truths: [], artifacts: [], keyLinks: [] },
    mustNotHaves: [],
    tddSequence: { testFiles: [], testCases: [], implementationFiles: [] },
  };
}

async function runTDDEnforcement(
  projectRoot: string,
  state: ProjectState
): Promise<{ passed: boolean; message: string } | null> {
  if (!state.tddSubPhase) return null;

  const taskPlan = await loadTaskPlan(projectRoot, state);
  if (!taskPlan) return null;

  // If TDD sequence is empty (no test files specified), skip enforcement
  if (taskPlan.tddSequence.testFiles.length === 0) return null;

  const result = await enforceTDDPhase(
    state.tddSubPhase,
    projectRoot,
    taskPlan.tddSequence
  );

  return { passed: result.passed, message: result.message };
}

async function runStaticVerification(
  projectRoot: string,
  state: ProjectState
): Promise<{ passed: boolean; checks: Array<{ passed: boolean; name: string; message: string }> } | null> {
  const taskPlan = await loadTaskPlan(projectRoot, state);
  if (!taskPlan) return null;

  // If no artifacts defined, skip verification
  if (taskPlan.mustHaves.artifacts.length === 0 && taskPlan.mustHaves.keyLinks.length === 0) {
    return null;
  }

  return await verifyMustHaves(projectRoot, taskPlan.mustHaves);
}

// ─── Status Display ──────────────────────────────────────────────

async function printStatus(projectRoot: string) {
  const state = await readState(projectRoot);
  console.log("\n--- Current State ---");
  console.log(`Phase:     ${state.phase}`);
  console.log(`TDD:       ${state.tddSubPhase ?? "n/a"}`);
  console.log(`Milestone: ${state.currentMilestone ?? "none"}`);
  console.log(`Slice:     ${state.currentSlice ?? "none"}`);
  console.log(`Task:      ${state.currentTask ?? "none"}`);
  console.log(`Updated:   ${state.lastUpdated}`);
  console.log("--------------------\n");
}

// ─── Entry Point ─────────────────────────────────────────────────

main().catch((err) => {
  console.error("[SUPER_CLAUDE] Fatal error:", err);
  process.exit(1);
});
