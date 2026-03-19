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
import { enforceTDDPhase } from "./tdd.ts";
import { verifyMustHaves } from "./verify.ts";
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
import { runCommandVerification } from "./verify.ts";
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
import { computePressure, formatPressureStatus } from "./budget-pressure.ts";
import type { PressurePolicy } from "./budget-pressure.ts";
import { processDiscussOutput, processResearchOutput, processReassessOutput } from "./phase-handlers.ts";
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
  const MAX_GREEN_RETRIES = 3;

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
    const context = await assembleContext(projectRoot, currentState, pressure.contextBudgetMultiplier);

    // 8. Generate prompt (agent-enriched per §8)
    const prompt = await buildAgentEnrichedPrompt(projectRoot, currentState, context);

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

        if (retryCount < MAX_GREEN_RETRIES - 1) {
          greenRetries.set(taskKey, retryCount + 1);
          continue;
        }

        // Max retries exhausted — invoke Doctor agent for diagnosis (§10.2)
        console.log(`  Max GREEN retries exhausted. Invoking Doctor agent...`);
        session.issuesEncountered.push(`TDD: ${tddResult.message} after ${MAX_GREEN_RETRIES} attempts on ${taskKey}`);
        const doctorContext = await assembleContext(projectRoot, currentState);
        const diagnosis = await invokeDoctorAgent(
          projectRoot,
          currentState,
          doctorContext,
          `TDD ${currentState.tddSubPhase} phase failed after ${MAX_GREEN_RETRIES} attempts: ${tddResult.message}`,
          config.timeouts.hard
        );
        if (diagnosis) {
          console.log(`  Doctor diagnosis: ${diagnosis.slice(0, 200)}`);
          session.issuesEncountered.push(`Doctor: ${diagnosis.slice(0, 200)}`);
          // Give one more attempt after Doctor's diagnosis
          greenRetries.set(taskKey, 0);
          continue;
        }

        // Doctor couldn't help — flag as blocked
        session.blockedItems.push(`${taskKey}: TDD ${currentState.tddSubPhase} failed after ${MAX_GREEN_RETRIES} attempts + Doctor diagnosis`);
        break;
      }
      if (tddResult !== null) {
        console.log(`  TDD OK: ${tddResult.message}`);
        // Reset retry counter on success
        greenRetries.delete(taskKey);
      }
    }

    // 12. (Verification moved to slice level — see COMPLETE_SLICE section below)

    // 13. Git commit for successful work (§13.3)
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

      // 12.1 Full test suite
      const { runFullTestSuite: runFull } = await import("./tdd.ts");
      const fullTestResult = await runFull(projectRoot);
      if (!fullTestResult.passing) {
        console.log(`  SLICE VERIFY FAIL: ${fullTestResult.failedTests} test(s) failing in full suite`);
        session.issuesEncountered.push(`Slice verify: ${fullTestResult.failedTests} test(s) failing on ${currentState.currentSlice}`);
      } else {
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
        // Log but don't block slice completion — issues are tracked for human review
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
    }

    // Track completed tasks (after IMPLEMENT — verification happens at slice level)
    if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "IMPLEMENT" &&
        currentState.currentSlice && currentState.currentTask) {
      session.tasksCompleted.push(`${currentState.currentSlice}/${currentState.currentTask}: ${nextAction.description}`);

      // GAP-21: Write task summary deterministically (§7.3 fractal summaries)
      if (currentState.currentMilestone) {
        await writeTaskSummaryOnComplete(
          projectRoot,
          currentState.currentMilestone,
          currentState.currentSlice,
          currentState.currentTask,
          nextAction.description,
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

    // 14. Process phase-specific output (DISCUSS, RESEARCH, REASSESS)
    if (result.output) {
      if (currentState.phase === "DISCUSS" && currentState.currentMilestone) {
        const discussResult = await processDiscussOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Discuss: ${discussResult.grayAreasCount} gray areas, ${discussResult.decisionsCount} decisions`);
      } else if (currentState.phase === "RESEARCH" && currentState.currentMilestone) {
        const researchResult = await processResearchOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Research: ${researchResult.dontHandRollCount} don't-hand-roll, ${researchResult.pitfallsCount} pitfalls`);
      } else if (currentState.phase === "REASSESS" && currentState.currentMilestone) {
        const reassessResult = await processReassessOutput(projectRoot, currentState.currentMilestone, result.output);
        console.log(`  Reassess: ${reassessResult.changes.length} changes proposed, roadmap ${reassessResult.roadmapUpdated ? "updated" : "unchanged"}`);
      }
    }

    // 15. Update state
    const newState = computeNextState(currentState, nextAction);
    await writeState(projectRoot, newState);

    // 16. Release lock
    await releaseLock(projectRoot);

    // 17. Track cost
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

  console.log(`[SUPER_CLAUDE] Loop complete. ${iterations} iterations, ~$${costTracker.totalCost.toFixed(2)} total.`);
  console.log(`  Session report: .superclaude/history/session-${sessionId}.md`);
  console.log(`  Cost tracker: .superclaude/history/metrics/cost-tracker-${sessionId}.md`);
  console.log(`  Dashboard: .superclaude/state/DASHBOARD.md`);
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
  const timestamp = Date.now();
  const debugDir = `${getProjectRoot()}/.superclaude/history/debug`;
  await Bun.$`mkdir -p ${debugDir}`.quiet();

  try {
    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = `/tmp/superclaude-prompt-${timestamp}.md`;
    await Bun.write(tmpFile, prompt);

    // Log prompt for debugging
    await Bun.write(`${debugDir}/prompt-${timestamp}.md`, prompt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const proc = Bun.spawn(
        ["sh", "-c", `claude -p "$(cat ${tmpFile})" --allowedTools "Read,Write,Edit,Bash,Glob,Grep" 2>&1`],
        { signal: controller.signal, stdout: "pipe", stderr: "pipe" }
      );

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      clearTimeout(timer);

      // Cleanup temp file (keep debug copy)
      await Bun.$`rm -f ${tmpFile}`.quiet();

      // Log output for debugging
      const status = exitCode === 0 ? "OK" : `FAIL(${exitCode})`;
      await Bun.write(
        `${debugDir}/output-${timestamp}.md`,
        `# Claude Output [${status}]\n\n${output}\n`
      );

      if (exitCode !== 0) {
        const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";
        return { success: false, output: null, error: stderr || output || `Exit code ${exitCode}` };
      }

      return { success: true, output, error: null };
    } catch (err) {
      clearTimeout(timer);
      await Bun.$`rm -f /tmp/superclaude-prompt-${timestamp}.md`.quiet();
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes("abort") || message.includes("signal");
      const error = isTimeout ? `Timeout after ${timeoutMs}ms: subprocess killed` : message;

      // Log error for debugging
      await Bun.write(`${debugDir}/output-${timestamp}.md`, `# Claude Error\n\n${error}\n`);

      return { success: false, output: null, error };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: null, error: message };
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
      return "implementer";
    case "COMPLETE_SLICE":
    case "COMPLETE_MILESTONE":
      return "scribe";
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
  if (!role) {
    return buildPrompt(state, context);
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

  // Build phase-specific prompt content
  const phaseContent = buildPrompt(state, enrichedContext);

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

  const prompt = await buildAgentPrompt("doctor", doctorContext, [
    `The system is stuck: ${stuckReason}`,
    `Current phase: ${state.phase}, TDD sub-phase: ${state.tddSubPhase ?? "n/a"}`,
    `Milestone: ${state.currentMilestone ?? "none"}, Slice: ${state.currentSlice ?? "none"}, Task: ${state.currentTask ?? "none"}`,
    "Diagnose the root cause and propose a specific fix.",
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
 * Write a task summary after VERIFY phase completes.
 * Populates with available data: task ID, description, and files from git.
 */
async function writeTaskSummaryOnComplete(
  projectRoot: string,
  milestone: string,
  slice: string,
  task: string,
  description: string,
  llmOutput: string | null
): Promise<void> {
  try {
    // Get modified files from git diff
    const gitDiff = await Bun.$`git -C ${projectRoot} diff --name-only HEAD~1 2>/dev/null || echo ""`.text();
    const filesModified = gitDiff.trim().split("\n").filter(Boolean);

    const data: TaskSummary = {
      task,
      status: "complete",
      filesModified,
      patternsEstablished: [],
      whatWasBuilt: description,
      keyDecisions: {},
      downstreamNotes: [],
    };

    // Extract patterns from LLM output if available
    if (llmOutput) {
      const patternMatch = llmOutput.match(/pattern[s]?\s*(?:established|discovered|used):\s*(.+)/i);
      if (patternMatch?.[1]) {
        data.patternsEstablished = patternMatch[1].split(",").map(p => p.trim()).filter(Boolean);
      }
    }

    const summaryMd = generateTaskSummary(data);
    const summaryPath = `${projectRoot}/${PATHS.taskPath(milestone, slice, task)}/SUMMARY.md`;
    await Bun.write(summaryPath, summaryMd);
    console.log(`  Summary: ${task} written`);
  } catch {
    // Summary writing is best-effort
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

    // Read task summaries
    const tasksDir = `${slicePath}/tasks`;
    const taskIds: string[] = [];
    try {
      const entries = await Bun.$`ls ${tasksDir} 2>/dev/null`.text();
      taskIds.push(...entries.trim().split("\n").filter(Boolean).sort());
    } catch {
      // No tasks directory
    }

    const data: SliceSummary = {
      slice,
      status: "complete",
      tasksCompleted: taskIds,
      demoSentence: llmOutput?.match(/(?:demo|user can)\s*[:\-]?\s*(.+)/i)?.[1]?.trim() ?? "",
      whatWasBuilt: llmOutput?.slice(0, 500) ?? "",
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
