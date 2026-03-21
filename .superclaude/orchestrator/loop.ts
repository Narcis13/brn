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
import { readState, writeState, determineNextActionEnhanced, advanceTDDPhase } from "./state.ts";
import { findNextTask } from "./milestone-manager.ts";
import { assembleContext } from "./context.ts";
import { buildPrompt } from "./prompt-builder.ts";
import {
  buildAgentPrompt,
  buildReviewPrompt,
  buildScopeGuard,
  getAgentDefinition,
  getVaultDocsForAgent,
  parseAgentOutput,
  parseReviewOutput,
} from "./agents.ts";
import { enforceTDDPhase, captureBaselineSnapshot, saveBaselineSnapshot, loadBaselineSnapshot, compareAgainstBaseline } from "./tdd.ts";
import { verifyMustHaves, preflight } from "./verify.ts";
import { parseTaskPlan } from "./plan-parser.ts";
import { writeContinueHere, writeReviewFeedback, clearReviewFeedback, readReviewAttemptCount } from "./scaffold.ts";
import {
  createMilestoneBranch,
  commitTDDPhase,
  commitSliceComplete,
  commitMilestoneComplete,
  createCheckpoint,
  rollbackToCheckpoint,
  tagRelease,
  createMilestonePR,
  stageAll,
  isCleanWorkingTree,
  isScopedClean,
} from "./git.ts";
import {
  createCostTracker,
  recordCostEntry,
  isBudgetExceeded,
  estimateCost,
  writeCostTracker,
} from "./cost.ts";
import {
  createPostmortem,
  writePostmortem,
  nextPostmortemId,
} from "./postmortem.ts";
import { runPostmortemAnalysis } from "./evolver.ts";
import {
  createSessionMetrics,
  writeSessionMetrics,
} from "./metrics.ts";
import { runCommandVerification, runFrontendSmoke } from "./verify.ts";
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
  writeSessionContinue,
} from "./session.ts";
import { computePressure, formatPressureStatus } from "./budget-pressure.ts";
import type { PressurePolicy } from "./budget-pressure.ts";
import { processDiscussOutput, processResearchOutput, processReassessOutput, processRetrospectiveOutput } from "./phase-handlers.ts";
import { assembleDashboard, renderDashboard, writeDashboard } from "./dashboard.ts";
import { generateTaskSummary, generateSliceSummary, generateMilestoneSummary } from "./summary.ts";
import type { TaskSummary, SliceSummary } from "./types.ts";
import type { AgentRole, ContextPayload, OrchestratorConfig, Phase, ProjectState, TaskPlan, TDDSubPhase } from "./types.ts";
import { PATHS, REVIEW_PERSONAS, MAX_REVIEW_RETRIES } from "./types.ts";

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
  const sessionId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "-auto";
  const session = createSession(sessionId);
  let costTracker = createCostTracker(sessionId);
  let iterations = 0;
  const maxIterations = 100;
  const dispatchHistory: Array<{ task: string; timestamp: string }> = [];
  const greenRetries = new Map<string, number>();
  const attemptRecords = new Map<string, AttemptRecord[]>();  // taskKey → structured attempt data
  const MAX_GREEN_RETRIES = 3;
  const deferredTasks: Array<{ taskKey: string; milestone: string; slice: string; task: string; reason: string; failureContext: string }> = [];

  // Crash recovery: check for stale lock
  if (await isLocked(projectRoot)) {
    const lockData = await readLock(projectRoot);
    if (lockData) {
      console.log(`[SUPER_CLAUDE] Found stale lock from PID ${lockData.pid} on ${lockData.task}`);
      console.log(`  Releasing lock and attempting to resume...`);
      await releaseLock(projectRoot);
    }
  }

  // Apply --milestone flag to state if provided and no milestone is set (GAP-7)
  const state = await readState(projectRoot);
  if (config.milestone && !state.currentMilestone) {
    state.currentMilestone = config.milestone;
    await writeState(projectRoot, state);
    console.log(`  Milestone set from CLI: ${config.milestone}`);
  }

  // Ensure milestone branch exists
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

    // 2. Determine next action (with budget pressure awareness)
    const pressure = computePressure({
      currentCost: costTracker.totalCost,
      budgetCeiling: config.budgetCeiling,
    });
    const nextAction = await determineNextActionEnhanced(projectRoot, currentState, pressure);

    // Log budget pressure tier changes
    if (iterations === 1 || iterations % 10 === 0) {
      console.log(`  ${formatPressureStatus(pressure)}`);
    }

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

      // Invoke Doctor agent for diagnosis (§8.3)
      console.log(`  Invoking Doctor agent for diagnosis...`);
      const doctorContext = await assembleContext(projectRoot, currentState);
      const diagnosis = await invokeDoctorAgent(
        projectRoot,
        currentState,
        doctorContext,
        stuckResult.reason ?? "Unknown reason",
        config.timeouts.hard
      );
      if (diagnosis) {
        console.log(`  Doctor diagnosis: ${diagnosis.slice(0, 200)}`);
        session.issuesEncountered.push(`Doctor: ${diagnosis.slice(0, 200)}`);
      }

      // Skip-and-continue: defer this task instead of breaking the loop
      if (currentState.currentMilestone && currentState.currentSlice && currentState.currentTask) {
        const reason = `stuck after multiple dispatches: ${stuckResult.reason}`;
        deferredTasks.push({
          taskKey,
          milestone: currentState.currentMilestone,
          slice: currentState.currentSlice,
          task: currentState.currentTask,
          reason,
          failureContext: diagnosis ?? stuckResult.reason ?? "Unknown",
        });
        console.log(`  DEFERRED: ${taskKey} — will retry after remaining tasks complete`);
        session.issuesEncountered.push(`Deferred ${taskKey}: ${reason}`);

        // Write CONTINUE.md for the deferred task
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
            watchOutFor: [reason],
            firstThingToDo: "Retry with fresh context after other tasks complete",
          }
        );

        // Advance to next task in the slice
        const nextTask = await findNextTaskExcluding(projectRoot, currentState.currentMilestone, currentState.currentSlice, deferredTasks.map(d => d.task));
        if (nextTask) {
          const advancedState: ProjectState = {
            ...currentState,
            currentTask: nextTask,
            tddSubPhase: "IMPLEMENT",
            lastUpdated: new Date().toISOString(),
          };
          await writeState(projectRoot, advancedState);
          await releaseLock(projectRoot);
          greenRetries.delete(taskKey);
          continue;
        }
        // No more tasks to skip to — fall through to deferred retry below
        session.blockedItems.push(`${taskKey}: stuck after multiple dispatches (no tasks to skip to)`);
        break;
      }
      session.blockedItems.push(`${taskKey}: stuck after multiple dispatches`);
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
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "IMPLEMENT" &&
        currentState.currentSlice && currentState.currentTask) {
      const dirty = !(await isCleanWorkingTree(projectRoot));
      if (dirty) {
        console.log(`  WARNING: Working tree has uncommitted changes. Commit orchestrator fixes before running.`);
      }
      await createCheckpoint(projectRoot, currentState.currentSlice, currentState.currentTask);
      console.log(`  Checkpoint: ${currentState.currentSlice}/${currentState.currentTask}`);
    }

    // 7. Assemble context (with budget pressure multiplier — GAP-11)
    // Context rotation: progressively enrich context on retry attempts
    const retryAttempt = greenRetries.get(taskKey) ?? 0;
    let contextMultiplier = pressure.contextBudgetMultiplier;
    const extraContext: string[] = [];

    if (currentState.phase === "EXECUTE_TASK" && retryAttempt > 0) {
      const priorRecords = attemptRecords.get(taskKey) ?? [];

      if (retryAttempt >= 1 && priorRecords.length > 0) {
        // Attempt 2+: inject full test output from prior attempt
        const lastRecord = priorRecords[priorRecords.length - 1]!;
        extraContext.push(`## Prior Attempt Test Output (Attempt ${lastRecord.attempt})\n**Result:** ${lastRecord.message}\n\`\`\`\n${lastRecord.testOutput}\n\`\`\``);
      }
      if (retryAttempt >= 2) {
        // Attempt 3: expand context budget to 1.5x (override pressure tier)
        contextMultiplier = Math.max(contextMultiplier, 1.5);
      }
    }

    // 7b. Load task complexity for context filtering
    let taskComplexity: import("./types.ts").TaskComplexity = "standard";
    if (currentState.phase === "EXECUTE_TASK") {
      const plan = await loadTaskPlan(projectRoot, currentState);
      if (plan) taskComplexity = plan.complexity ?? "standard";
    }

    const context = await assembleContext(projectRoot, currentState, contextMultiplier, extraContext, taskComplexity);

    // 7c. Pre-flight validation before Claude invocation
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase) {
      const taskPlan = await loadTaskPlan(projectRoot, currentState);
      if (taskPlan) {
        const preflightResult = await preflight(projectRoot, currentState, taskPlan);
        if (preflightResult.fixes.length > 0) {
          console.log(`  Pre-flight fixes: ${preflightResult.fixes.map(f => f.description).join("; ")}`);
        }
        if (!preflightResult.ok) {
          console.log(`  Pre-flight blockers: ${preflightResult.blockers.join("; ")}`);
          session.issuesEncountered.push(`Pre-flight: ${preflightResult.blockers.join("; ")}`);
        }
      }
    }

    // 8. Generate prompt (agent-enriched per §8)
    const prompt = await buildAgentEnrichedPrompt(projectRoot, currentState, context);

    // 9. Invoke Claude headless (adaptive model/effort based on phase + complexity)
    const invocationOpts = resolveInvocationOptions(currentState.phase, taskComplexity);
    console.log(`  Action: ${nextAction.description} [${invocationOpts.model}/${invocationOpts.effort}]`);
    const result = await invokeClaudeHeadless(prompt, config.timeouts.hard, invocationOpts);

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

      // GAP-8: Create postmortem for task failure (§12.3)
      await createPostmortemForFailure(
        projectRoot, sessionId, taskKey,
        result.error ?? "Unknown error",
        currentState
      );

      await releaseLock(projectRoot);
      stopReason = "error";
      break;
    }

    // 11. TDD enforcement (only during EXECUTE_TASK) with bounded retry (GAP-20)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase) {
      const tddResult = await runTDDEnforcement(projectRoot, currentState);
      if (tddResult !== null && !tddResult.passed) {
        const retryCount = greenRetries.get(taskKey) ?? 0;
        console.log(`  TDD FAIL (attempt ${retryCount + 1}/${MAX_GREEN_RETRIES}): ${tddResult.message}`);

        // Record structured attempt data for context rotation and Doctor handoff
        const records = attemptRecords.get(taskKey) ?? [];
        records.push({
          attempt: retryCount + 1,
          message: tddResult.message,
          testOutput: tddResult.testOutput,
          timestamp: new Date().toISOString(),
        });
        attemptRecords.set(taskKey, records);

        if (retryCount < MAX_GREEN_RETRIES - 1) {
          greenRetries.set(taskKey, retryCount + 1);
          continue;
        }

        // Max retries exhausted — invoke Doctor agent for diagnosis (§10.2)
        // Write ERROR_CONTEXT.md and give Doctor full context + structured failure history
        console.log(`  Max GREEN retries exhausted. Invoking Doctor agent...`);
        session.issuesEncountered.push(`TDD: ${tddResult.message} after ${MAX_GREEN_RETRIES} attempts on ${taskKey}`);

        const allRecords = attemptRecords.get(taskKey) ?? [];

        // Write ERROR_CONTEXT.md to task directory for Doctor reference
        const errorContextPath = await writeErrorContext(projectRoot, currentState, allRecords);
        if (errorContextPath) {
          console.log(`  Wrote ERROR_CONTEXT.md for Doctor at ${errorContextPath}`);
        }

        const failureHistory = buildFailureHistory(taskKey, currentState.tddSubPhase ?? "IMPLEMENT", allRecords);
        const doctorContext = await assembleContext(
          projectRoot,
          currentState,
          1.0,  // Full context — ignore pressure tier for Doctor
          [failureHistory]
        );
        const diagnosis = await invokeDoctorAgent(
          projectRoot,
          currentState,
          doctorContext,
          `TDD ${currentState.tddSubPhase} phase failed after ${MAX_GREEN_RETRIES} attempts: ${tddResult.message}`,
          config.timeouts.hard
        );
        if (diagnosis) {
          console.log(`  Doctor diagnosis: ${diagnosis.slice(0, 500)}`);
          session.issuesEncountered.push(`Doctor: ${diagnosis.slice(0, 500)}`);
          // Give one more attempt after Doctor's diagnosis
          greenRetries.set(taskKey, 0);
          continue;
        }

        // Doctor couldn't help — defer task and move to next
        if (currentState.currentMilestone && currentState.currentSlice && currentState.currentTask) {
          const reason = `TDD ${currentState.tddSubPhase} failed after ${MAX_GREEN_RETRIES} attempts + Doctor diagnosis`;
          deferredTasks.push({
            taskKey,
            milestone: currentState.currentMilestone,
            slice: currentState.currentSlice,
            task: currentState.currentTask,
            reason,
            failureContext: tddResult.message,
          });
          console.log(`  DEFERRED: ${taskKey} — will retry after remaining tasks complete`);
          session.issuesEncountered.push(`Deferred ${taskKey}: ${reason}`);

          // Write CONTINUE.md for the deferred task
          await writeContinueHere(
            projectRoot,
            currentState.currentMilestone,
            currentState.currentSlice,
            currentState.currentTask,
            {
              interruptedAt: currentState.tddSubPhase ?? "unknown",
              whatsDone: [],
              whatRemains: [`Fix failing tests: ${tddResult.message}`],
              decisionsMade: [],
              watchOutFor: [reason],
              firstThingToDo: "Retry with fresh context after other tasks complete",
            }
          );

          // Advance to next task in the slice
          const nextTask = await findNextTaskExcluding(projectRoot, currentState.currentMilestone, currentState.currentSlice, deferredTasks.map(d => d.task));
          if (nextTask) {
            const advancedState: ProjectState = {
              ...currentState,
              currentTask: nextTask,
              tddSubPhase: "IMPLEMENT",
              lastUpdated: new Date().toISOString(),
            };
            await writeState(projectRoot, advancedState);
            await releaseLock(projectRoot);
            greenRetries.delete(taskKey);
            continue;
          }
          // No more tasks to skip to — fall through to deferred retry below
        }
        session.blockedItems.push(`${taskKey}: TDD ${currentState.tddSubPhase} failed after ${MAX_GREEN_RETRIES} attempts + Doctor diagnosis`);
        break;
      }
      if (tddResult !== null) {
        console.log(`  TDD OK: ${tddResult.message}`);
        // Reset retry counter and attempt records on success
        greenRetries.delete(taskKey);
        attemptRecords.delete(taskKey);
      }
    }

    // 12. (Verification moved to slice level — see COMPLETE_SLICE section below)

    // 13. Track completed tasks + write summaries (before commit so they're included)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "IMPLEMENT" &&
        currentState.currentSlice && currentState.currentTask) {
      session.tasksCompleted.push(`${currentState.currentSlice}/${currentState.currentTask}: ${nextAction.description}`);

      // GAP-21: Write task summary deterministically (§7.3 fractal summaries)
      if (currentState.currentMilestone) {
        // Use the task plan's goal as the summary description, not the generic action label
        const taskPlan = await loadTaskPlan(projectRoot, currentState);
        const taskGoal = taskPlan?.goal ?? nextAction.description;
        await writeTaskSummaryOnComplete(
          projectRoot,
          currentState.currentMilestone,
          currentState.currentSlice,
          currentState.currentTask,
          taskGoal,
          result.output
        );
      }

      // GAP-13: Clean up CONTINUE.md after successful task completion
      // Per spec §7.5: "CONTINUE.md is consumed on resume (ephemeral)"
      if (currentState.currentMilestone) {
        const continuePath = `${projectRoot}/${PATHS.taskPath(currentState.currentMilestone, currentState.currentSlice, currentState.currentTask)}/CONTINUE.md`;
        try {
          await Bun.$`rm -f ${continuePath}`.quiet();
        } catch {
          // File may not exist — that's fine
        }
      }
    }

    // 14. Update state (before commit so state.json is included)
    let newState = computeNextState(currentState, nextAction);

    // If a task just completed (phase moved to COMPLETE_SLICE), check for remaining tasks
    // before writing state. This avoids a wasted loop iteration in auto mode and fixes
    // step mode where COMPLETE_SLICE would stick without a next iteration.
    if (newState.phase === "COMPLETE_SLICE" && currentState.phase === "EXECUTE_TASK" &&
        newState.currentMilestone && newState.currentSlice) {
      const remainingTask = await findNextTask(projectRoot, newState.currentMilestone, newState.currentSlice);
      if (remainingTask) {
        newState = {
          ...newState,
          phase: "EXECUTE_TASK",
          tddSubPhase: "IMPLEMENT",
          currentTask: remainingTask,
        };
        console.log(`  Next task: ${newState.currentSlice}/${remainingTask}`);
      }
    }

    await writeState(projectRoot, newState);

    // 15. Git commit for successful work (§13.3)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase &&
        currentState.currentSlice && currentState.currentTask) {
      const clean = await isScopedClean(projectRoot);
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
      // 12. Slice-level verification: full test suite + command checks + reviewer quality gate
      console.log(`  Slice verification: running full suite...`);

      // 12.1 Full test suite — compare against baseline to distinguish regressions
      const { runFullTestSuite: runFull } = await import("./tdd.ts");
      const fullTestResult = await runFull(projectRoot);

      if (!fullTestResult.passing && currentState.currentMilestone && currentState.currentSlice) {
        const slicePath = PATHS.slicePath(currentState.currentMilestone, currentState.currentSlice);
        const baseline = await loadBaselineSnapshot(projectRoot, slicePath);

        if (baseline) {
          const comparison = compareAgainstBaseline(fullTestResult, baseline);
          if (comparison.regressionCount > 0) {
            console.log(`  SLICE VERIFY FAIL: ${comparison.regressionCount} NEW regression(s): ${comparison.newFailures.join(", ")}`);
            session.issuesEncountered.push(`Slice verify: ${comparison.regressionCount} regression(s) on ${currentState.currentSlice}: ${comparison.newFailures.join(", ")}`);
          } else {
            console.log(`  SLICE VERIFY OK: ${fullTestResult.failedTests} failure(s) are all pre-existing (baseline: ${baseline.failedTests})`);
          }
          if (comparison.preExisting.length > 0) {
            console.log(`  Pre-existing failures (not blocking): ${comparison.preExisting.join(", ")}`);
          }
        } else {
          // No baseline — fall back to original behavior
          console.log(`  SLICE VERIFY FAIL: ${fullTestResult.failedTests} test(s) failing in full suite (no baseline available)`);
          session.issuesEncountered.push(`Slice verify: ${fullTestResult.failedTests} test(s) failing on ${currentState.currentSlice}`);
        }
      } else if (fullTestResult.passing) {
        console.log(`  SLICE VERIFY OK: all ${fullTestResult.totalTests} test(s) passing`);
      }

      // 12.2 Command-tier verification: tsc + linter
      const cmdChecks = await runCommandVerification(projectRoot);
      const cmdFailures = cmdChecks.filter((c) => !c.passed);
      if (cmdFailures.length > 0) {
        console.log(`  CMD VERIFY FAIL: ${cmdFailures.length} check(s) failed`);
        for (const f of cmdFailures) {
          console.log(`    ✗ ${f.name}: ${f.message}`);
        }
        session.issuesEncountered.push(`Command verification: ${cmdFailures.map(f => f.name).join(", ")} failed on ${currentState.currentSlice}`);
      } else {
        console.log(`  CMD VERIFY OK: ${cmdChecks.map(c => c.name).join(", ")} passed`);
      }

      // 12.2b Frontend smoke check — verify servability for frontend slices
      if (currentState.currentMilestone && currentState.currentSlice) {
        const slicePlanPath = `${projectRoot}/${PATHS.slicePath(currentState.currentMilestone, currentState.currentSlice)}/PLAN.md`;
        const slicePlanContent = await Bun.file(slicePlanPath).text().catch(() => "");
        const frontendResult = await runFrontendSmoke(projectRoot, slicePlanContent);

        if (frontendResult.isFrontendSlice) {
          const frontendFails = frontendResult.checks.filter((c) => !c.passed);
          if (frontendFails.length > 0) {
            console.log(`  FRONTEND SMOKE FAIL: ${frontendFails.length} check(s) failed`);
            for (const f of frontendFails) {
              console.log(`    ✗ ${f.name}: ${f.message}`);
            }
            session.issuesEncountered.push(`Frontend smoke: ${frontendFails.map(f => f.name).join(", ")} failed on ${currentState.currentSlice}`);
          } else {
            console.log(`  FRONTEND SMOKE OK: ${frontendResult.checks.length} check(s) passed`);
          }
        }
      }

      // 12.3 Reviewer quality gate (runs once for the entire slice)
      const reviewResult = await runReviewerQualityGate(
        projectRoot, currentState, context, pressure, config.timeouts.hard
      );
      if (!reviewResult.passed) {
        console.log(`  SLICE REVIEW: ${reviewResult.mustFixCount} MUST-FIX issue(s) found`);
        for (const issue of reviewResult.issues) {
          console.log(`    ✗ ${issue}`);
        }
        session.issuesEncountered.push(`Slice review: ${reviewResult.mustFixCount} MUST-FIX issues on ${currentState.currentSlice}`);

        // Review enforcement: limit remediation tasks by budget pressure
        const maxRemediation = pressure.tier === "GREEN" ? reviewResult.mustFixCount : pressure.tier === "YELLOW" ? Math.min(reviewResult.mustFixCount, 3) : 0;
        if (maxRemediation > 0) {
          console.log(`  Scheduling ${maxRemediation} remediation task(s) (budget tier: ${pressure.tier})`);
          session.issuesEncountered.push(`Remediation: ${maxRemediation} task(s) scheduled for ${currentState.currentSlice}`);
        } else {
          console.log(`  Skipping remediation (budget tier: ${pressure.tier})`);
        }
      } else if (pressure.allowReview && pressure.reviewPersonaCount > 0) {
        console.log(`  SLICE REVIEW OK: ${pressure.reviewPersonaCount} persona(s) passed`);
      }

      // GAP-21: Write slice summary from aggregated task summaries (§7.3)
      if (currentState.currentMilestone) {
        await writeSliceSummaryOnComplete(
          projectRoot,
          currentState.currentMilestone,
          currentState.currentSlice,
          result.output
        );

        // Auto-generate boundary contract for downstream slices
        await writeSliceContract(projectRoot, currentState.currentMilestone, currentState.currentSlice);
      }

      const clean = await isScopedClean(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        await commitSliceComplete(projectRoot, currentState.currentSlice);
        console.log(`  Committed: feat(${currentState.currentSlice}): complete slice`);
      }
      session.tasksCompleted.push(`${currentState.currentSlice}: Slice complete`);
    } else if (currentState.phase === "COMPLETE_MILESTONE" && currentState.currentMilestone) {
      // GAP-21: Write milestone summary from aggregated slice summaries (§7.3)
      await writeMilestoneSummaryOnComplete(
        projectRoot,
        currentState.currentMilestone,
        result.output
      );

      const clean = await isScopedClean(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        await commitMilestoneComplete(projectRoot, currentState.currentMilestone);
        console.log(`  Committed: feat(${currentState.currentMilestone}): milestone complete`);
      }
      // GAP-14: Tag the release per spec §6.8
      const tag = await tagRelease(projectRoot, currentState.currentMilestone);
      console.log(`  Tagged: ${tag}`);

      // Create PR for human review instead of auto-merging to main
      const prResult = await createMilestonePR(
        projectRoot,
        currentState.currentMilestone,
        result.output?.split("\n")[0] ?? `Milestone ${currentState.currentMilestone} complete`
      );
      if (prResult.success) {
        console.log(`  PR: ${prResult.message}`);
      } else {
        console.log(`  PR skipped: ${prResult.message}`);
      }
    }

    // 15b. Capture baseline test snapshot after PLAN_SLICE completes
    if (currentState.phase === "PLAN_SLICE" && currentState.currentMilestone && currentState.currentSlice) {
      console.log(`  Capturing baseline test snapshot for ${currentState.currentSlice}...`);
      const baseline = await captureBaselineSnapshot(projectRoot);
      const slicePath = PATHS.slicePath(currentState.currentMilestone, currentState.currentSlice);
      await saveBaselineSnapshot(projectRoot, slicePath, baseline);
      if (baseline.failedTests > 0) {
        console.log(`  Baseline: ${baseline.failedTests} pre-existing failure(s) recorded [${baseline.failingTestNames.join(", ")}]`);
      } else {
        console.log(`  Baseline: all ${baseline.totalTests} test(s) passing`);
      }
    }

    // 16. Process phase-specific output (DISCUSS, RESEARCH, REASSESS)
    if (result.output) {
      if (currentState.phase === "DISCUSS" && currentState.currentMilestone) {
        const discussResult = await processDiscussOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Discuss: ${discussResult.grayAreasCount} gray areas, ${discussResult.decisionsCount} decisions`);
      } else if (currentState.phase === "RESEARCH" && currentState.currentMilestone) {
        const researchResult = await processResearchOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Research: ${researchResult.dontHandRollCount} don't-hand-roll, ${researchResult.pitfallsCount} pitfalls`);
      } else if (currentState.phase === "RETROSPECTIVE" && currentState.currentMilestone && currentState.currentSlice) {
        const retroResult = await processRetrospectiveOutput(projectRoot, currentState.currentMilestone, currentState.currentSlice, result.output);
        console.log(`  Retrospective: ${retroResult.learningsCount} learnings, ${retroResult.decisionsCount} decisions, ${retroResult.playbooksCount} playbooks`);
        if (!retroResult.success) {
          console.log(`  WARNING: Retrospective produced 0 vault docs — Claude may not have written files to disk`);
          session.issuesEncountered.push(`Retrospective: 0 vault docs written for ${currentState.currentSlice}`);
        }
        if (retroResult.vaultDocsWritten.length > 0) {
          // Commit vault docs
          const clean = await isScopedClean(projectRoot);
          if (!clean) {
            await stageAll(projectRoot);
            await commitTDDPhase(
              projectRoot,
              currentState.currentSlice,
              "retro",
              "retrospective",
              `Extract ${retroResult.vaultDocsWritten.length} vault docs from ${currentState.currentSlice}`
            );
            console.log(`  Committed: feat(${currentState.currentSlice}/retro): [retrospective] vault knowledge extraction`);
          }
        }
      } else if (currentState.phase === "REASSESS" && currentState.currentMilestone) {
        const reassessResult = await processReassessOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Reassess: ${reassessResult.changes.length} changes proposed, roadmap ${reassessResult.roadmapUpdated ? "updated" : "unchanged"}`);
      }
    }

    // 17. Release lock
    await releaseLock(projectRoot);

    // 18. Track cost (use actual cost from CLI when available, fall back to estimate)
    const promptTokens = result.usage?.inputTokens ?? Math.ceil(prompt.length / 4);
    const outputTokens = result.usage?.outputTokens ?? Math.ceil((result.output?.length ?? 0) / 4);
    const stepCost = result.usage?.costUsd ?? estimateCost(promptTokens, outputTokens, invocationOpts.model);
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

  // ─── Deferred Task Retry ─────────────────────────────────────────
  // After all other tasks complete, retry deferred tasks once with fresh context.
  if (deferredTasks.length > 0 && stopReason !== "budget_exceeded") {
    console.log(`\n[SUPER_CLAUDE] Retrying ${deferredTasks.length} deferred task(s)...`);

    for (const deferred of deferredTasks) {
      console.log(`  Retrying deferred task: ${deferred.taskKey} (reason: ${deferred.reason})`);

      // Set state to the deferred task
      const retryState: ProjectState = {
        phase: "EXECUTE_TASK",
        tddSubPhase: "IMPLEMENT",
        currentMilestone: deferred.milestone,
        currentSlice: deferred.slice,
        currentTask: deferred.task,
        lastUpdated: new Date().toISOString(),
      };
      await writeState(projectRoot, retryState);

      // Fresh context assembly + prompt + invocation
      const pressure = computePressure({
        currentCost: costTracker.totalCost,
        budgetCeiling: config.budgetCeiling,
      });

      if (isBudgetExceeded(costTracker, config.budgetCeiling)) {
        console.log(`  Budget exceeded during deferred retry. Stopping.`);
        stopReason = "budget_exceeded";
        break;
      }

      const retryContext = await assembleContext(projectRoot, retryState);
      const retryPrompt = await buildAgentEnrichedPrompt(projectRoot, retryState, retryContext);
      const retryOpts = resolveInvocationOptions(retryState.phase, "standard");
      const retryResult = await invokeClaudeHeadless(retryPrompt, config.timeouts.hard, retryOpts);

      if (!retryResult.success) {
        console.log(`  Deferred retry FAILED for ${deferred.taskKey}: ${retryResult.error}`);
        session.blockedItems.push(`${deferred.taskKey}: deferred retry failed — ${retryResult.error}`);
        continue;
      }

      // TDD enforcement on retry
      const tddResult = await runTDDEnforcement(projectRoot, retryState);
      if (tddResult !== null && !tddResult.passed) {
        console.log(`  Deferred retry TDD FAILED for ${deferred.taskKey}: ${tddResult.message}`);
        session.blockedItems.push(`${deferred.taskKey}: deferred retry TDD failed — ${tddResult.message}`);
        continue;
      }

      // Success — task recovered!
      console.log(`  Deferred retry SUCCEEDED for ${deferred.taskKey}`);
      session.tasksCompleted.push(`${deferred.taskKey}: recovered from deferred state`);

      // Write task summary and commit
      if (retryResult.output) {
        const taskPlan = await loadTaskPlan(projectRoot, retryState);
        const taskGoal = taskPlan?.goal ?? "Deferred task recovery";
        await writeTaskSummaryOnComplete(
          projectRoot,
          deferred.milestone,
          deferred.slice,
          deferred.task,
          taskGoal,
          retryResult.output
        );
      }

      // Clean up CONTINUE.md
      const continuePath = `${projectRoot}/${PATHS.taskPath(deferred.milestone, deferred.slice, deferred.task)}/CONTINUE.md`;
      try { await Bun.$`rm -f ${continuePath}`.quiet(); } catch { /* ok */ }

      // Commit if there are changes
      const clean = await isScopedClean(projectRoot);
      if (!clean) {
        await stageAll(projectRoot);
        await commitTDDPhase(projectRoot, deferred.slice, deferred.task, "implement", "Deferred task recovery");
        console.log(`  Committed: feat(${deferred.slice}/${deferred.task}): [implement] deferred recovery`);
      }

      // Track cost (use actual cost from CLI when available)
      const promptTokens = retryResult.usage?.inputTokens ?? Math.ceil(retryPrompt.length / 4);
      const outputTokens = retryResult.usage?.outputTokens ?? Math.ceil((retryResult.output?.length ?? 0) / 4);
      const stepCost = retryResult.usage?.costUsd ?? estimateCost(promptTokens, outputTokens, retryOpts.model);
      costTracker = recordCostEntry(costTracker, {
        phase: "EXECUTE_TASK" as Phase,
        tokensIn: promptTokens,
        tokensOut: outputTokens,
        estimatedCost: stepCost,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ─── Session Complete ───────────────────────────────────────────

  const finalSession = endSession(session, stopReason, costTracker.totalCost);

  // Write session CONTINUE.md for the current task (session continuity)
  const finalState = await readState(projectRoot);
  await writeSessionContinue(projectRoot, finalState, finalSession);

  // Write session report and cost tracker
  await writeSessionReport(projectRoot, finalSession);
  await writeCostTracker(projectRoot, costTracker);

  // GAP-9: Populate and write session metrics
  const metrics = createSessionMetrics(sessionId);
  metrics.tasksAttempted = iterations;
  metrics.tasksCompleted = finalSession.tasksCompleted.length;
  metrics.tasksFailed = stopReason === "error" ? 1 : 0;
  metrics.totalCost = costTracker.totalCost;
  // Aggregate cost per phase from cost tracker entries
  for (const entry of costTracker.entries) {
    const phase = entry.phase;
    metrics.costPerPhase[phase] = (metrics.costPerPhase[phase] ?? 0) + entry.estimatedCost;
    metrics.tokenUsage[phase] = (metrics.tokenUsage[phase] ?? 0) + entry.tokensIn + entry.tokensOut;
  }
  // Count review issues from session issues
  for (const issue of finalSession.issuesEncountered) {
    if (issue.includes("MUST-FIX")) {
      metrics.reviewIssues["MUST-FIX"] = (metrics.reviewIssues["MUST-FIX"] ?? 0) + 1;
    }
  }
  await writeSessionMetrics(projectRoot, metrics);

  // Generate and write dashboard
  try {
    const dashboardData = await assembleDashboard(projectRoot, costTracker, config.budgetCeiling);
    await writeDashboard(projectRoot, dashboardData);
    console.log(renderDashboard(dashboardData));
  } catch {
    // Dashboard generation is best-effort
  }

  // Trailing commit: capture session report, dashboard, and any remaining state changes
  const postLoopClean = await isScopedClean(projectRoot);
  if (!postLoopClean) {
    await stageAll(projectRoot);
    const currentState = await readState(projectRoot);
    const milestone = currentState.currentMilestone ?? "session";
    await Bun.$`git -C ${projectRoot} commit -m ${"chore(" + milestone + "): update session report and dashboard"}`.quiet().catch(() => {});
    console.log(`  Committed: chore(${milestone}): update session report and dashboard`);
  }

  console.log(`[SUPER_CLAUDE] Loop complete. ${iterations} iterations, ~$${costTracker.totalCost.toFixed(2)} total.`);
  console.log(`  Session report: .superclaude/history/sessions/session-${sessionId}.md`);
  console.log(`  Cost tracker: .superclaude/history/metrics/cost-tracker-${sessionId}.md`);
  console.log(`  Dashboard: .superclaude/state/DASHBOARD.md`);
}

// ─── Single Step ─────────────────────────────────────────────────

async function runSingleStep(projectRoot: string, config: OrchestratorConfig) {
  await runAutoLoop(projectRoot, { ...config, mode: "step" });
}

// ─── Claude Invocation ───────────────────────────────────────────

interface InvocationUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;  // actual cost from CLI (total_cost_usd)
}

interface InvocationResult {
  success: boolean;
  output: string | null;
  error: string | null;
  usage: InvocationUsage | null;
  sessionId: string | null;
}

/** CLI flags for adaptive Claude invocation based on phase + complexity. */
interface InvocationOptions {
  model: "sonnet" | "opus";
  effort: "medium" | "high" | "max";
}

/**
 * Resolve invocation options from phase and task complexity.
 * - Simple/standard tasks and non-critical phases → sonnet (cheaper, faster)
 * - Complex tasks and critical planning phases → opus (more capable)
 */
export function resolveInvocationOptions(
  phase: Phase,
  complexity: TaskComplexity | null
): InvocationOptions {
  // Planning phases need opus for architectural judgment
  if (phase === "PLAN_MILESTONE" || phase === "PLAN_SLICE") {
    return { model: "opus", effort: "high" };
  }

  // EXECUTE_TASK — depends on task complexity
  if (phase === "EXECUTE_TASK") {
    switch (complexity) {
      case "simple":
        return { model: "sonnet", effort: "medium" };
      case "complex":
        return { model: "opus", effort: "max" };
      default: // "standard"
        return { model: "sonnet", effort: "high" };
    }
  }

  // All other phases (DISCUSS, RESEARCH, COMPLETE_SLICE, RETROSPECTIVE, REASSESS, COMPLETE_MILESTONE)
  // — summarization, analysis, knowledge extraction — sonnet handles fine
  return { model: "sonnet", effort: "medium" };
}

async function invokeClaudeHeadless(
  prompt: string,
  timeoutMs: number = 30 * 60 * 1000,
  options?: InvocationOptions
): Promise<InvocationResult> {
  const timestamp = Date.now();
  const debugDir = `${getProjectRoot()}/.superclaude/history/debug`;
  await Bun.$`mkdir -p ${debugDir}`.quiet();

  try {
    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/superclaude-prompt-${timestamp}.md`;
    await Bun.write(tmpFile, prompt);

    // Log prompt for debugging (include model/effort for traceability)
    const debugHeader = options
      ? `<!-- model: ${options.model}, effort: ${options.effort} -->\n`
      : "";
    await Bun.write(`${debugDir}/prompt-${timestamp}.md`, debugHeader + prompt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Build CLI args array — prompt is piped via stdin (no shell escaping issues)
    const args = [
      "claude", "-p",
      "--allowedTools", "Read,Write,Edit,Bash,Glob,Grep",
      "--no-session-persistence",
      "--output-format", "json",
    ];
    if (options) {
      args.push("--model", options.model);
      args.push("--effort", options.effort);
    }

    try {
      const proc = Bun.spawn(args, {
        signal: controller.signal,
        stdout: "pipe",
        stderr: "pipe",
        stdin: Bun.file(tmpFile),
      });

      const rawOutput = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      clearTimeout(timer);

      // Cleanup temp file (keep debug copy)
      await Bun.$`rm -f ${tmpFile}`.quiet();

      // Parse JSON output — extract result text, usage stats, and actual cost
      let output: string | null = null;
      let usage: InvocationUsage | null = null;
      let sessionId: string | null = null;

      try {
        const json = JSON.parse(rawOutput) as {
          result?: string;
          session_id?: string;
          total_cost_usd?: number;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        output = json.result ?? null;
        sessionId = json.session_id ?? null;
        if (json.usage) {
          usage = {
            inputTokens: json.usage.input_tokens ?? 0,
            outputTokens: json.usage.output_tokens ?? 0,
            costUsd: json.total_cost_usd ?? null,
          };
        }
      } catch {
        // JSON parse failed — fall back to raw text (e.g., older CLI version)
        output = rawOutput;
      }

      // Log output for debugging (text result + usage summary)
      const status = exitCode === 0 ? "OK" : `FAIL(${exitCode})`;
      const usageNote = usage
        ? `\n\n<!-- tokens_in: ${usage.inputTokens}, tokens_out: ${usage.outputTokens} -->`
        : "";
      await Bun.write(
        `${debugDir}/output-${timestamp}.md`,
        `# Claude Output [${status}]${usageNote}\n\n${output ?? rawOutput}\n`
      );

      if (exitCode !== 0) {
        const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";
        return { success: false, output: null, error: stderr || output || rawOutput || `Exit code ${exitCode}`, usage, sessionId };
      }

      return { success: true, output, error: null, usage, sessionId };
    } catch (err) {
      clearTimeout(timer);
      await Bun.$`rm -f /tmp/superclaude-prompt-${timestamp}.md`.quiet();
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes("abort") || message.includes("signal");
      const error = isTimeout ? `Timeout after ${timeoutMs}ms: subprocess killed` : message;

      // Log error for debugging
      await Bun.write(`${debugDir}/output-${timestamp}.md`, `# Claude Error\n\n${error}\n`);

      return { success: false, output: null, error, usage: null, sessionId: null };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: null, error: message, usage: null, sessionId: null };
  }
}

// ─── Agent Integration (§8 — Sub-Agent System) ─────────────────

/**
 * Maps each orchestrator phase to the appropriate sub-agent role.
 * Returns null for phases that don't need agent-specific framing (e.g., VERIFY is mechanical).
 */
export function getAgentRoleForPhase(
  phase: Phase,
  tddSubPhase: TDDSubPhase | null
): AgentRole | null {
  switch (phase) {
    case "DISCUSS":
      return "architect";
    case "RESEARCH":
      return "researcher";
    case "PLAN_MILESTONE":
    case "PLAN_SLICE":
      return "architect";
    case "EXECUTE_TASK":
      // Skip skill loading — prompt-builder generates complete strategy-specific
      // instructions (tdd-strict, test-after, verify-only). The implementer skill
      // hardcodes TDD-strict language that contradicts test-after/verify-only prompts.
      return null;
    case "COMPLETE_SLICE":
    case "COMPLETE_MILESTONE":
      return "scribe";
    case "RETROSPECTIVE":
      return "evolver";
    case "REASSESS":
      return "architect";
    default:
      return null;
  }
}

/**
 * Build a prompt enriched with agent-specific context (§8.4).
 * Wraps the phase-specific prompt from prompt-builder.ts with:
 *   - Agent role header (beginning — high attention per §7.2)
 *   - Agent-specific vault docs merged into context
 *   - Agent scope guard (end — high attention per §7.2)
 * Falls back to generic buildPrompt() for phases without agent mapping.
 */
async function buildAgentEnrichedPrompt(
  projectRoot: string,
  state: ProjectState,
  context: ContextPayload
): Promise<string> {
  const role = getAgentRoleForPhase(state.phase, state.tddSubPhase);

  // Load task-level verification strategy for EXECUTE_TASK
  const taskPlan = state.phase === "EXECUTE_TASK" ? await loadTaskPlan(projectRoot, state) : null;
  const strategy = taskPlan?.strategy ?? "tdd-strict";

  if (!role) {
    return buildPrompt(state, context, strategy);
  }

  const definition = getAgentDefinition(role);
  const scopeGuard = buildScopeGuard(role);

  // Load agent-specific vault docs and merge (deduplicated)
  const agentVaultDocs = await getVaultDocsForAgent(projectRoot, role);
  const existingDocs = new Set(context.vaultDocs);
  const newDocs = agentVaultDocs.filter(d => !existingDocs.has(d));
  const enrichedContext: ContextPayload = {
    ...context,
    vaultDocs: [...context.vaultDocs, ...newDocs],
  };

  // Build phase-specific prompt content (with strategy for EXECUTE_TASK)
  const phaseContent = buildPrompt(state, enrichedContext, strategy);

  // Frame with agent identity (beginning — high attention region per §7.2)
  const roleName = definition.role.charAt(0).toUpperCase() + definition.role.slice(1);
  const header = `# Agent: ${roleName}\n**Role:** ${definition.description}\n\n`;

  // Append agent scope guard (end — high attention region per §7.2)
  const footer = `\n\n## Agent Scope Guard\n${scopeGuard.map(g => `- ${g}`).join("\n")}\n`;

  return header + phaseContent + footer;
}

/**
 * Run reviewer personas and collect issues (§8.3).
 * Number of personas is governed by budget pressure tier.
 */
async function runReviewerQualityGate(
  projectRoot: string,
  state: ProjectState,
  context: ContextPayload,
  pressure: PressurePolicy,
  timeoutMs: number,
): Promise<{ passed: boolean; mustFixCount: number; issues: string[] }> {
  if (!pressure.allowReview || pressure.reviewPersonaCount === 0) {
    return { passed: true, mustFixCount: 0, issues: [] };
  }

  // Select personas based on budget pressure (GREEN=6, YELLOW=3, ORANGE=1, RED=0)
  const activePersonas = REVIEW_PERSONAS.slice(0, pressure.reviewPersonaCount);
  const allIssues: string[] = [];
  let mustFixCount = 0;

  // Load reviewer-specific vault docs
  const reviewerVaultDocs = await getVaultDocsForAgent(projectRoot, "reviewer");
  const existingDocs = new Set(context.vaultDocs);
  const newDocs = reviewerVaultDocs.filter(d => !existingDocs.has(d));
  const reviewContext: ContextPayload = {
    ...context,
    vaultDocs: [...context.vaultDocs, ...newDocs],
  };

  for (const persona of activePersonas) {
    console.log(`    Reviewing: ${persona}...`);
    const reviewPrompt = buildReviewPrompt(persona, reviewContext);
    const result = await invokeClaudeHeadless(reviewPrompt, timeoutMs);

    if (result.success && result.output) {
      const parsed = parseReviewOutput(persona, result.output);
      for (const issue of parsed.issues) {
        const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : "";
        if (issue.severity === "MUST-FIX") {
          mustFixCount++;
          allIssues.push(`[${persona}] MUST-FIX: ${issue.description}${location}`);
        }
      }
    }
  }

  return { passed: mustFixCount === 0, mustFixCount, issues: allIssues };
}

/**
 * Invoke the Doctor agent for stuck diagnosis (§8.3).
 * Returns the diagnosis content, or null if invocation fails.
 */
async function invokeDoctorAgent(
  projectRoot: string,
  state: ProjectState,
  context: ContextPayload,
  stuckReason: string,
  timeoutMs: number,
): Promise<string | null> {
  // Load doctor-specific vault docs
  const doctorVaultDocs = await getVaultDocsForAgent(projectRoot, "doctor");
  const existingDocs = new Set(context.vaultDocs);
  const newDocs = doctorVaultDocs.filter(d => !existingDocs.has(d));
  const doctorContext: ContextPayload = {
    ...context,
    vaultDocs: [...context.vaultDocs, ...newDocs],
  };

  // Reference ERROR_CONTEXT.md if it exists in the task directory
  const errorContextHint = state.currentMilestone && state.currentSlice && state.currentTask
    ? `\nA structured error report has been written to ${PATHS.taskPath(state.currentMilestone, state.currentSlice, state.currentTask)}/ERROR_CONTEXT.md — read it for full test outputs and error pattern analysis.`
    : "";

  const prompt = await buildAgentPrompt("doctor", doctorContext, [
    `The system is stuck: ${stuckReason}`,
    `Current phase: ${state.phase}, TDD sub-phase: ${state.tddSubPhase ?? "n/a"}`,
    `Milestone: ${state.currentMilestone ?? "none"}, Slice: ${state.currentSlice ?? "none"}, Task: ${state.currentTask ?? "none"}`,
    `Diagnose the root cause and propose a specific fix.${errorContextHint}`,
  ], projectRoot);

  const result = await invokeClaudeHeadless(prompt, timeoutMs);
  if (result.success && result.output) {
    const parsed = parseAgentOutput("doctor", result.output);
    return parsed.content;
  }
  return null;
}

// ─── State Transitions ──────────────────────────────────────────

export function computeNextState(
  current: ProjectState,
  action: { phase: string; tddSubPhase: string | null; milestone?: string | null; slice?: string | null; task?: string | null },
): ProjectState {
  const next = { ...current, lastUpdated: new Date().toISOString() };

  // Apply discovered milestone/slice/task IDs from the action (GAP-4 fix)
  if (action.milestone !== undefined) {
    next.currentMilestone = action.milestone ?? next.currentMilestone;
  }
  if (action.slice !== undefined) {
    next.currentSlice = action.slice;
  }
  if (action.task !== undefined) {
    next.currentTask = action.task;
  }

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
  } else if (action.phase !== current.phase) {
    // Phase transition from enhanced state machine
    next.phase = action.phase as ProjectState["phase"];
    next.tddSubPhase = action.tddSubPhase as ProjectState["tddSubPhase"];
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

  const content = await file.text();
  return parseTaskPlan(content);
}

async function runTDDEnforcement(
  projectRoot: string,
  state: ProjectState
): Promise<{ passed: boolean; message: string; testOutput: string } | null> {
  if (!state.tddSubPhase) return null;

  const taskPlan = await loadTaskPlan(projectRoot, state);
  if (!taskPlan) return null;

  const strategy = taskPlan.strategy ?? "tdd-strict";

  // verify-only tasks skip TDD entirely
  if (strategy === "verify-only") {
    return { passed: true, message: "TDD skipped (verify-only strategy).", testOutput: "" };
  }

  if (taskPlan.tddSequence.testFiles.length === 0) return null;

  const result = await enforceTDDPhase(
    state.tddSubPhase,
    projectRoot,
    taskPlan.tddSequence,
    strategy
  );

  return {
    passed: result.passed,
    message: result.message,
    testOutput: result.testResult?.output ?? "",
  };
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

// ─── Context Rotation Helper ─────────────────────────────────────

/** Structured record of a single TDD attempt for Doctor handoff. */
export interface AttemptRecord {
  attempt: number;
  message: string;       // Short TDD result message
  testOutput: string;    // Full bun test stdout+stderr
  timestamp: string;
}

/**
 * Build a structured failure history for the Doctor agent.
 * Includes full test output from all prior attempts so Doctor has the complete picture.
 */
function buildFailureHistory(
  taskKey: string,
  phase: string,
  records: AttemptRecord[]
): string {
  const lines = [
    `## Failure History: ${taskKey}`,
    `**Phase:** ${phase}`,
    `**Attempts:** ${records.length}`,
    "",
  ];

  for (const rec of records) {
    lines.push(`### Attempt ${rec.attempt}`);
    lines.push(`**Time:** ${rec.timestamp}`);
    lines.push(`**Result:** ${rec.message}`);
    lines.push("");
    lines.push("**Test Output:**");
    lines.push("```");
    lines.push(rec.testOutput || "No output captured");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Write ERROR_CONTEXT.md to the task directory for structured Doctor handoff.
 * Contains full failure history, test isolation check, and diagnostic hints.
 */
async function writeErrorContext(
  projectRoot: string,
  state: ProjectState,
  records: AttemptRecord[]
): Promise<string | null> {
  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;
  if (!m || !s || !t) return null;

  const taskKey = `${s}/${t}`;
  const errorContext = [
    `## Failed Task: ${taskKey}`,
    `## Phase: ${state.tddSubPhase ?? "IMPLEMENT"}`,
    `## Attempts: ${records.length}`,
    "",
  ];

  for (const rec of records) {
    errorContext.push(`### Attempt ${rec.attempt}`);
    errorContext.push(`- **Time:** ${rec.timestamp}`);
    errorContext.push(`- **Result:** ${rec.message}`);
    errorContext.push(`- **Test output:**`);
    errorContext.push("```");
    errorContext.push(rec.testOutput || "No output captured");
    errorContext.push("```");
    errorContext.push("");
  }

  // Add test isolation check
  errorContext.push("### Test Isolation Check");
  errorContext.push("- Per-file results: see individual attempt outputs above (each file runs in its own subprocess)");
  errorContext.push("- Full suite uses per-file isolation — if tests fail only in suite, suspect database state or global mock leaks");
  errorContext.push("");

  // Classify error patterns across attempts
  const patterns = classifyErrorPatterns(records);
  if (patterns.length > 0) {
    errorContext.push("### Error Patterns Detected");
    for (const p of patterns) {
      errorContext.push(`- ${p}`);
    }
    errorContext.push("");
  }

  const content = errorContext.join("\n");
  const path = `${projectRoot}/${PATHS.taskPath(m, s, t)}/ERROR_CONTEXT.md`;
  await Bun.write(path, content);
  return path;
}

/**
 * Classify common error patterns from attempt records.
 */
function classifyErrorPatterns(records: AttemptRecord[]): string[] {
  const patterns: string[] = [];
  const allOutput = records.map((r) => r.testOutput).join("\n");

  if (allOutput.includes("mock.module") || allOutput.includes("mock is not a function")) {
    patterns.push("**Mock pollution:** mock.module leak detected — tests may share global mock state");
  }
  if (allOutput.includes("SQLITE_BUSY") || allOutput.includes("database is locked")) {
    patterns.push("**Database contention:** SQLite lock detected — tests may share database files");
  }
  if (allOutput.includes("EADDRINUSE") || allOutput.includes("address already in use")) {
    patterns.push("**Port conflict:** address already in use — tests may not clean up servers");
  }
  if (allOutput.includes("TypeError") || allOutput.includes("is not a function")) {
    patterns.push("**Type error:** runtime type mismatch — check imports and function signatures");
  }
  if (allOutput.includes("Cannot find module") || allOutput.includes("Module not found")) {
    patterns.push("**Missing module:** import resolution failure — check file paths and exports");
  }

  // Check if same test fails consistently vs intermittently
  const failCounts = new Map<string, number>();
  for (const rec of records) {
    const failures = rec.testOutput.match(/\(fail\)\s+(.+)/g) ?? [];
    for (const f of failures) {
      const name = f.replace(/^\(fail\)\s+/, "");
      failCounts.set(name, (failCounts.get(name) ?? 0) + 1);
    }
  }
  const intermittent = [...failCounts.entries()].filter(([, count]) => count < records.length);
  if (intermittent.length > 0) {
    patterns.push(`**Intermittent failures:** ${intermittent.map(([name]) => name).join(", ")} — fail in some attempts but not all`);
  }

  return patterns;
}

// ─── Skip-and-Continue Helper ────────────────────────────────────

/**
 * Find the next pending/in-progress task in a slice, excluding deferred tasks.
 * Returns null if no eligible tasks remain.
 */
async function findNextTaskExcluding(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  excludeTaskIds: string[]
): Promise<string | null> {
  const { listTasks } = await import("./milestone-manager.ts");
  const tasks = await listTasks(projectRoot, milestoneId, sliceId);
  const excludeSet = new Set(excludeTaskIds);

  const eligible = tasks.find(
    (t) => !excludeSet.has(t.id) && (t.status === "pending" || t.status === "in_progress")
  );
  return eligible?.id ?? null;
}

// ─── Postmortem (GAP-8: §12.3) ──────────────────────────────────

/**
 * Create a postmortem report when a task fails.
 * Queues an evolver analysis for the next session.
 */
async function createPostmortemForFailure(
  projectRoot: string,
  sessionId: string,
  taskKey: string,
  errorMessage: string,
  state: ProjectState
): Promise<void> {
  try {
    const pmId = await nextPostmortemId(projectRoot);
    const pm = createPostmortem({
      id: pmId,
      session: sessionId,
      failure: {
        what: errorMessage,
        when: `${state.phase}/${state.tddSubPhase ?? "n/a"} on ${taskKey}`,
        impact: "Task execution failed — manual intervention may be required",
      },
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
        impact: "moderate",
        effort: "moderate",
        recommendation: "fix-soon",
      },
    });

    await writePostmortem(projectRoot, pm);
    console.log(`  Postmortem created: ${pmId}`);

    // Generate evolver proposals from postmortem
    const proposals = await runPostmortemAnalysis(projectRoot, pmId);
    if (proposals.length > 0) {
      console.log(`  Evolver proposals: ${proposals.length} generated for human review`);
    }
  } catch {
    // Postmortem creation is best-effort — don't fail the loop
  }
}

// ─── Summary Writing (GAP-21: §7.3 Fractal Summaries) ──────────

/**
 * Write an enriched task summary after IMPLEMENT completes.
 * Uses deterministic code intelligence to extract exports, imports, and test coverage.
 */
async function writeTaskSummaryOnComplete(
  projectRoot: string,
  milestone: string,
  slice: string,
  task: string,
  description: string,
  _llmOutput: string | null
): Promise<void> {
  try {
    const { buildTaskIntel, renderTaskIntelSummary } = await import("./code-intel.ts");

    // Get modified files from git diff
    const gitDiff = await Bun.$`git -C ${projectRoot} diff --name-only HEAD~1 2>/dev/null || echo ""`.text();
    const filesModified = gitDiff.trim().split("\n").filter(Boolean);

    // Build deterministic intelligence from actual code
    const intel = await buildTaskIntel(projectRoot, milestone, slice, task);

    // Render enriched summary with exports, signatures, test counts
    const enrichedBody = intel
      ? renderTaskIntelSummary(intel)
      : `## What Was Built\n${description}`;

    // Build downstream notes from exports
    const downstreamNotes: string[] = [];
    if (intel) {
      for (const artifact of intel.artifacts) {
        for (const exp of artifact.exports) {
          downstreamNotes.push(`\`${artifact.path}\` exports \`${exp.name}\` (${exp.kind})`);
        }
      }
    }

    const data: TaskSummary = {
      task,
      status: "complete",
      filesModified: filesModified.filter(f => !f.startsWith(".superclaude/")),
      patternsEstablished: [],
      whatWasBuilt: intel?.goal ?? description,
      keyDecisions: {},
      downstreamNotes,
    };

    // Write structured frontmatter + enriched body
    const summaryMd = generateTaskSummary(data) + "\n" + (intel ? renderTaskIntelSummary(intel).replace(/^## What Was Built\n.*\n/, "") : "");
    const summaryPath = `${projectRoot}/${PATHS.taskPath(milestone, slice, task)}/SUMMARY.md`;
    await Bun.write(summaryPath, summaryMd);
    console.log(`  Summary: ${task} written (${intel?.artifacts.length ?? 0} artifacts, ${intel?.testFiles.reduce((s, t) => s + t.testCount, 0) ?? 0} tests)`);
  } catch (err) {
    // Summary writing is best-effort — log but don't crash
    console.error(`  Summary: ${task} failed — ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Write a slice summary after COMPLETE_SLICE.
 * Reads task summaries to aggregate into a slice-level summary.
 */
async function writeSliceSummaryOnComplete(
  projectRoot: string,
  milestone: string,
  slice: string,
  llmOutput: string | null
): Promise<void> {
  try {
    const slicePath = `${projectRoot}/${PATHS.slicePath(milestone, slice)}`;

    // Read demo sentence from slice PLAN.md frontmatter
    let demoSentence = "";
    const planFile = Bun.file(`${slicePath}/PLAN.md`);
    if (await planFile.exists()) {
      const planContent = await planFile.text();
      const demoMatch = planContent.match(/demo_sentence:\s*"?([^"\n]+)"?/i);
      demoSentence = demoMatch?.[1]?.trim() ?? "";
    }

    // Read task summaries and aggregate what was built
    const tasksDir = `${slicePath}/tasks`;
    const taskIds: string[] = [];
    const taskBuiltItems: string[] = [];
    try {
      const entries = await Bun.$`ls ${tasksDir} 2>/dev/null`.text();
      const sortedIds = entries.trim().split("\n").filter(Boolean).sort();
      for (const taskId of sortedIds) {
        taskIds.push(taskId);
        const summaryFile = Bun.file(`${tasksDir}/${taskId}/SUMMARY.md`);
        if (await summaryFile.exists()) {
          const content = await summaryFile.text();
          const builtMatch = content.match(/## What Was Built\n([\s\S]*?)(?=\n##|$)/);
          const built = builtMatch?.[1]?.trim();
          if (built) taskBuiltItems.push(`- **${taskId}:** ${built}`);
        }
      }
    } catch {
      // No tasks directory
    }

    const whatWasBuilt = taskBuiltItems.length > 0
      ? taskBuiltItems.join("\n")
      : llmOutput?.slice(0, 500) ?? "";

    const data: SliceSummary = {
      slice,
      status: "complete",
      tasksCompleted: taskIds,
      demoSentence,
      whatWasBuilt,
      interfacesProduced: [],
      patternsEstablished: [],
      knownLimitations: [],
    };

    const summaryMd = generateSliceSummary(data);
    await Bun.write(`${slicePath}/SUMMARY.md`, summaryMd);
    console.log(`  Summary: ${slice} written`);
  } catch {
    // Summary writing is best-effort
  }
}

/**
 * Auto-generate a boundary contract for a completed slice.
 * Writes to vault/contracts/ so downstream slices can see what this slice produces.
 */
async function writeSliceContract(
  projectRoot: string,
  milestone: string,
  slice: string
): Promise<void> {
  try {
    const { buildSliceContract, renderSliceContract } = await import("./code-intel.ts");
    const contract = await buildSliceContract(projectRoot, milestone, slice);
    if (!contract || contract.produces.length === 0) return;

    const contractMd = renderSliceContract(contract);
    const contractDir = `${projectRoot}/${PATHS.vault}/contracts`;
    await Bun.$`mkdir -p ${contractDir}`.quiet();
    await Bun.write(`${contractDir}/${milestone}-${slice}.md`, contractMd);
    console.log(`  Contract: ${milestone}-${slice} written (${contract.produces.length} files, ${contract.produces.reduce((s, f) => s + f.exports.length, 0)} exports)`);
  } catch (err) {
    console.error(`  Contract: ${milestone}-${slice} failed — ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Write a milestone summary after COMPLETE_MILESTONE.
 * Reads slice summaries to aggregate into a milestone-level summary.
 */
async function writeMilestoneSummaryOnComplete(
  projectRoot: string,
  milestone: string,
  llmOutput: string | null
): Promise<void> {
  try {
    const milestonePath = `${projectRoot}/${PATHS.milestonePath(milestone)}`;

    // Read slice summaries
    const slicesDir = `${milestonePath}/slices`;
    const sliceSummaries: SliceSummary[] = [];
    try {
      const sliceDirs = await Bun.$`ls ${slicesDir} 2>/dev/null`.text();
      for (const sliceId of sliceDirs.trim().split("\n").filter(Boolean).sort()) {
        const summaryFile = Bun.file(`${slicesDir}/${sliceId}/SUMMARY.md`);
        if (await summaryFile.exists()) {
          const content = await summaryFile.text();
          // Parse basic fields from slice summary frontmatter
          const statusMatch = content.match(/^status:\s*(.+)$/m);
          const tasksMatch = content.match(/^tasks_completed:\s*\[(.+)\]$/m);
          const demoMatch = content.match(/## Demo Sentence\n(.+)/);
          const builtMatch = content.match(/## What Was Built\n([\s\S]*?)(?=\n##|$)/);

          sliceSummaries.push({
            slice: sliceId,
            status: (statusMatch?.[1]?.trim() ?? "complete") as "complete" | "failed",
            tasksCompleted: tasksMatch?.[1]?.split(",").map(t => t.trim()).filter(Boolean) ?? [],
            demoSentence: demoMatch?.[1]?.trim() ?? "",
            whatWasBuilt: builtMatch?.[1]?.trim() ?? "",
            interfacesProduced: [],
            patternsEstablished: [],
            knownLimitations: [],
          });
        }
      }
    } catch {
      // No slices directory
    }

    const description = llmOutput?.slice(0, 200) ?? `Milestone ${milestone}`;
    const summaryMd = generateMilestoneSummary(milestone, description, sliceSummaries);
    await Bun.write(`${milestonePath}/SUMMARY.md`, summaryMd);
    console.log(`  Summary: ${milestone} written`);
  } catch {
    // Summary writing is best-effort
  }
}

// ─── Status Display ──────────────────────────────────────────────

async function printStatus(projectRoot: string) {
  try {
    const config = parseArgs([]);
    const dashboardData = await assembleDashboard(projectRoot, null, config.budgetCeiling);
    console.log(renderDashboard(dashboardData));
  } catch {
    // Fallback to basic status
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
}

// ─── Entry Point ─────────────────────────────────────────────────

main().catch((err) => {
  console.error("[SUPER_CLAUDE] Fatal error:", err);
  process.exit(1);
});
