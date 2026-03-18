/**
 * SUPER_CLAUDE — Main Orchestration Loop
 * The deterministic brain. Reads state → builds prompt → invokes Claude → updates state.
 *
 * Phase 4 integration: git operations, cost tracking, supervision, session reports.
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
import { writeContinueHere } from "./scaffold.ts";
import {
  createMilestoneBranch,
  commitTDDPhase,
  commitSliceComplete,
  commitMilestoneComplete,
  createCheckpoint,
  rollbackToCheckpoint,
  squashMergeToMain,
  stageAll,
  stashChanges,
  isCleanWorkingTree,
} from "./git.ts";
import {
  createCostTracker,
  recordCostEntry,
  isBudgetExceeded,
  estimateCost,
  writeCostTracker,
} from "./cost.ts";
import {
  acquireLock,
  releaseLock,
  readLock,
  isLocked,
  detectStuck,
  checkTimeout,
} from "./supervision.ts";
import {
  createSession,
  endSession,
  writeSessionReport,
} from "./session.ts";
import type { OrchestratorConfig, ProjectState, TaskPlan } from "./types.ts";
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
  const sessionId = new Date().toISOString().slice(0, 10) + "-auto";
  const session = createSession(sessionId);
  let costTracker = createCostTracker(sessionId);
  let iterations = 0;
  const maxIterations = 100;
  const dispatchHistory: Array<{ task: string; timestamp: string }> = [];

  // Crash recovery: check for stale lock
  if (await isLocked(projectRoot)) {
    const lockData = await readLock(projectRoot);
    if (lockData) {
      console.log(`[SUPER_CLAUDE] Found stale lock from PID ${lockData.pid} on ${lockData.task}`);
      console.log(`  Releasing lock and attempting to resume...`);
      await releaseLock(projectRoot);
    }
  }

  // Ensure milestone branch exists
  const state = await readState(projectRoot);
  if (state.currentMilestone) {
    await createMilestoneBranch(projectRoot, state.currentMilestone);
  }

  let stopReason: "completed" | "budget_exceeded" | "error" = "completed";

  while (iterations < maxIterations) {
    iterations++;
    const iterationStart = Date.now();

    // 1. Read state
    const currentState = await readState(projectRoot);
    console.log(`[${iterations}] Phase: ${currentState.phase} | TDD: ${currentState.tddSubPhase ?? "n/a"} | M:${currentState.currentMilestone ?? "-"} S:${currentState.currentSlice ?? "-"} T:${currentState.currentTask ?? "-"}`);

    // 2. Determine next action
    const nextAction = await determineNextAction(projectRoot, currentState);

    if (nextAction.phase === "IDLE" && nextAction.description.includes("waiting")) {
      console.log("[SUPER_CLAUDE] No more work to do. Stopping.");
      break;
    }

    // 3. Check budget
    if (isBudgetExceeded(costTracker, config.budgetCeiling)) {
      console.log(`[SUPER_CLAUDE] Budget exceeded ($${costTracker.totalCost.toFixed(2)} / $${config.budgetCeiling}). Stopping.`);
      stopReason = "budget_exceeded";
      break;
    }

    // 4. Stuck detection
    const taskKey = `${currentState.currentSlice ?? ""}/${currentState.currentTask ?? ""}`;
    const stuckResult = detectStuck(taskKey, dispatchHistory);
    if (stuckResult.stuck) {
      console.log(`[SUPER_CLAUDE] STUCK: ${stuckResult.reason}`);
      session.issuesEncountered.push(`Stuck: ${stuckResult.reason}`);
      session.blockedItems.push(`${taskKey}: stuck after multiple dispatches`);
      // Skip to next task — in a full implementation, invoke Doctor agent first
      break;
    }
    dispatchHistory.push({ task: taskKey, timestamp: new Date().toISOString() });

    // 5. Acquire lock for the current task
    if (currentState.currentMilestone && currentState.currentSlice && currentState.currentTask) {
      const locked = await acquireLock(
        projectRoot,
        currentState.currentMilestone,
        currentState.currentSlice,
        currentState.currentTask
      );
      if (!locked) {
        // Lock already held — check if it's stale
        const lockData = await readLock(projectRoot);
        if (lockData) {
          console.log(`[SUPER_CLAUDE] Lock held by PID ${lockData.pid}. Releasing stale lock.`);
          await releaseLock(projectRoot);
          await acquireLock(
            projectRoot,
            currentState.currentMilestone,
            currentState.currentSlice,
            currentState.currentTask
          );
        }
      }
    }

    // 6. Git checkpoint before task execution (§13.4)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "RED" &&
        currentState.currentSlice && currentState.currentTask) {
      await stashChanges(projectRoot);
      await createCheckpoint(projectRoot, currentState.currentSlice, currentState.currentTask);
      console.log(`  Checkpoint: ${currentState.currentSlice}/${currentState.currentTask}`);
    }

    // 7. Assemble context
    const context = await assembleContext(projectRoot, currentState);

    // 8. Generate prompt
    const prompt = buildPrompt(currentState, context);

    // 9. Invoke Claude headless
    console.log(`  Action: ${nextAction.description}`);
    const result = await invokeClaudeHeadless(prompt, config.timeouts.hard);

    // 10. Check timeout
    const elapsed = Date.now() - iterationStart;
    const timeoutTier = checkTimeout(elapsed, config.timeouts);
    if (timeoutTier === "hard") {
      console.log(`[SUPER_CLAUDE] Hard timeout (${config.timeouts.hard}ms). Stopping.`);
      session.issuesEncountered.push(`Hard timeout on ${taskKey}`);
      stopReason = "error";
      break;
    } else if (timeoutTier === "soft") {
      console.log(`  WARNING: Soft timeout exceeded (${elapsed}ms)`);
      session.issuesEncountered.push(`Soft timeout on ${taskKey}: ${elapsed}ms`);
    }

    if (!result.success) {
      console.error(`  ERROR: ${result.error}`);
      session.issuesEncountered.push(`Error on ${taskKey}: ${result.error}`);

      // Write CONTINUE.md for crash recovery
      if (currentState.currentMilestone && currentState.currentSlice && currentState.currentTask) {
        await writeContinueHere(
          projectRoot,
          currentState.currentMilestone,
          currentState.currentSlice,
          currentState.currentTask,
          {
            interruptedAt: currentState.tddSubPhase ?? "unknown",
            whatsDone: [],
            whatRemains: [nextAction.description],
            decisionsMade: [],
            watchOutFor: [result.error ?? "Unknown error"],
            firstThingToDo: "Diagnose the error and retry",
          }
        );

        // Rollback failed task to checkpoint
        if (currentState.currentSlice && currentState.currentTask) {
          const hasCheckpoint = await Bun.$`git -C ${projectRoot} tag --list checkpoint/${currentState.currentSlice}/${currentState.currentTask}`
            .text()
            .catch(() => "");
          if (hasCheckpoint.trim()) {
            await rollbackToCheckpoint(projectRoot, currentState.currentSlice, currentState.currentTask);
            console.log(`  Rolled back to checkpoint ${currentState.currentSlice}/${currentState.currentTask}`);
          }
        }
      }

      await releaseLock(projectRoot);
      stopReason = "error";
      break;
    }

    // 11. TDD enforcement (only during EXECUTE_TASK)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase) {
      const tddResult = await runTDDEnforcement(projectRoot, currentState);
      if (tddResult !== null && !tddResult.passed) {
        console.log(`  TDD FAIL: ${tddResult.message}`);
        continue;
      }
      if (tddResult !== null) {
        console.log(`  TDD OK: ${tddResult.message}`);
      }
    }

    // 12. Static verification (during VERIFY sub-phase)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "VERIFY") {
      const verifyResult = await runStaticVerification(projectRoot, currentState);
      if (verifyResult !== null && !verifyResult.passed) {
        const failures = verifyResult.checks.filter((c) => !c.passed);
        console.log(`  VERIFY FAIL: ${failures.length} check(s) failed`);
        for (const f of failures) {
          console.log(`    ✗ ${f.name}: ${f.message}`);
        }
        continue;
      }
      if (verifyResult !== null) {
        console.log(`  VERIFY OK: all ${verifyResult.checks.length} static checks passed`);
      }
    }

    // 13. Git commit for successful work (§13.3)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase &&
        currentState.currentSlice && currentState.currentTask) {
      const clean = await isCleanWorkingTree(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        const tddLabel = currentState.tddSubPhase.toLowerCase();
        await commitTDDPhase(
          projectRoot,
          currentState.currentSlice,
          currentState.currentTask,
          tddLabel,
          nextAction.description
        );
        console.log(`  Committed: feat(${currentState.currentSlice}/${currentState.currentTask}): [${tddLabel}]`);
      }
    } else if (currentState.phase === "COMPLETE_SLICE" && currentState.currentSlice) {
      const clean = await isCleanWorkingTree(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        await commitSliceComplete(projectRoot, currentState.currentSlice);
        console.log(`  Committed: feat(${currentState.currentSlice}): complete slice`);
      }
      session.tasksCompleted.push(`${currentState.currentSlice}: Slice complete`);
    } else if (currentState.phase === "COMPLETE_MILESTONE" && currentState.currentMilestone) {
      const clean = await isCleanWorkingTree(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        await commitMilestoneComplete(projectRoot, currentState.currentMilestone);
        console.log(`  Committed: feat(${currentState.currentMilestone}): milestone complete`);
      }
    }

    // Track completed tasks
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "VERIFY" &&
        currentState.currentSlice && currentState.currentTask) {
      session.tasksCompleted.push(`${currentState.currentSlice}/${currentState.currentTask}: ${nextAction.description}`);
    }

    // 14. Update state
    const newState = computeNextState(currentState, nextAction);
    await writeState(projectRoot, newState);

    // 15. Release lock
    await releaseLock(projectRoot);

    // 16. Track cost
    const promptTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil((result.output?.length ?? 0) / 4);
    const stepCost = estimateCost(promptTokens, outputTokens);
    costTracker = recordCostEntry(costTracker, {
      phase: currentState.phase,
      tokensIn: promptTokens,
      tokensOut: outputTokens,
      estimatedCost: stepCost,
      timestamp: new Date().toISOString(),
    });

    console.log(`  Cost: ~$${stepCost.toFixed(4)} (total: $${costTracker.totalCost.toFixed(2)})`);
    console.log();

    // Step mode: stop after one iteration
    if (config.mode === "step") break;
  }

  // ─── Session Complete ───────────────────────────────────────────

  const finalSession = endSession(session, stopReason, costTracker.totalCost);

  // Write session report and cost tracker
  await writeSessionReport(projectRoot, finalSession);
  await writeCostTracker(projectRoot, costTracker);

  console.log(`[SUPER_CLAUDE] Loop complete. ${iterations} iterations, ~$${costTracker.totalCost.toFixed(2)} total.`);
  console.log(`  Session report: .superclaude/history/session-${sessionId}.md`);
  console.log(`  Cost tracker: .superclaude/history/metrics/cost-tracker-${sessionId}.md`);
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

async function invokeClaudeHeadless(
  prompt: string,
  timeoutMs: number = 30 * 60 * 1000
): Promise<InvocationResult> {
  try {
    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/superclaude-prompt-${Date.now()}.md`;
    await Bun.write(tmpFile, prompt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result =
        await Bun.$`claude -p "$(cat ${tmpFile})" --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1`
          .text()
          .catch((err: Error) => `ERROR: ${err.message}`);

      clearTimeout(timer);

      // Cleanup temp file
      await Bun.$`rm -f ${tmpFile}`.quiet();

      if (result.startsWith("ERROR:")) {
        return { success: false, output: null, error: result };
      }

      return { success: true, output: result, error: null };
    } catch (err) {
      clearTimeout(timer);
      await Bun.$`rm -f ${tmpFile}`.quiet();
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: null, error: message };
    }
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
