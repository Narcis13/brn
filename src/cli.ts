#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { hasGitRepository } from "./supercodex/git.js";
import { createProcessImprovementReport, listPatternCandidates, loadLearningState, runLearningCycle, showLearning } from "./supercodex/learning/index.js";
import { syncPlanningQueue, validatePlanningSurface } from "./supercodex/planning/index.js";
import { dispatchParallel, runIntegration, showIntegration, showParallel } from "./supercodex/parallel/index.js";
import { runMemoryAudit, runPostmortem } from "./supercodex/audit/index.js";
import { assessRecovery, reconcileRecovery } from "./supercodex/recovery/index.js";
import { getRuntimeAdapter } from "./supercodex/runtime/adapters.js";
import { resolvePacketPath, listRuntimeRegistry, loadDispatchPacket, probeRuntimes } from "./supercodex/runtime/registry.js";
import { loadRuntimeRunHandle } from "./supercodex/runtime/runs.js";
import { RUNTIME_IDS } from "./supercodex/runtime/types.js";
import { dispatchNextAction, formatNextActionShow, synthesizeNextAction } from "./supercodex/synth/next-action.js";
import { formatTaskVerificationState, generateSliceUat, getTaskVerificationState } from "./supercodex/verify/index.js";
import { findPlaceholderFiles, syncManagedTemplates } from "./supercodex/vault.js";
import {
  acquireLock,
  addQueueItem,
  computeNextEligibleItem,
  loadCurrentState,
  loadLocks,
  loadQueueState,
  loadTransitions,
  markQueueItemDone,
  reconcileState,
  removeQueueItem,
  releaseLock,
  runDoctor,
  saveCurrentState,
  seedTransitionHistory,
  transitionState,
  writeSchemaFiles,
} from "./supercodex/state.js";
import { validateCurrentState } from "./supercodex/schemas.js";
import { PHASES, QUEUE_STATUSES, UNIT_TYPES } from "./supercodex/types.js";
import type { CurrentState, LockRecord, Phase, QueueItem, QueueStatus, TransitionRecord, UnitType } from "./supercodex/types.js";
import type { RuntimeId } from "./supercodex/runtime/types.js";

interface CliOptions {
  cwd?: string;
  writeOut?: (text: string) => void;
  writeErr?: (text: string) => void;
}

function usage(): string {
  return [
    "Usage:",
    "  supercodex init",
    "  supercodex doctor",
    "  supercodex state show",
    "  supercodex state reconcile",
    "  supercodex state transition --to <phase> --reason <text> [--unit <unit_id>]",
    "  supercodex queue list",
    "  supercodex queue next",
    "  supercodex queue add <unit_id> --type <unit_type> [--status <status>] [--depends-on a,b] [--milestone M001] [--slice S01] [--task T01] [--notes <text>]",
    "  supercodex queue mark-done <unit_id>",
    "  supercodex queue remove <unit_id>",
    "  supercodex lock list",
    "  supercodex lock acquire <resource> --owner <owner> --scope <scope> --reason <text>",
    "  supercodex lock release <resource>",
    "  supercodex runtime list",
    "  supercodex runtime probe [claude|codex]",
    "  supercodex runtime dispatch --runtime <claude|codex> --packet <path>",
    "  supercodex runtime collect --run-id <run_id>",
    "  supercodex runtime resume --run-id <run_id> [--prompt <text>]",
    "  supercodex runtime cancel --run-id <run_id>",
    "  supercodex recover show [--run-id <run_id>]",
    "  supercodex recover reconcile [--run-id <run_id>]",
    "  supercodex audit memory --unit <unit_id>",
    "  supercodex audit postmortem --run-id <run_id>",
    "  supercodex learning show",
    "  supercodex learning run --unit <slice_unit_id> | --run-id <run_id>",
    "  supercodex learning skills",
    "  supercodex learning patterns",
    "  supercodex plan sync",
    "  supercodex plan validate [--unit <unit_id>]",
    "  supercodex parallel show",
    "  supercodex parallel dispatch [--workers <n>]",
    "  supercodex integrate show",
    "  supercodex integrate run [--unit <unit_id>]",
    "  supercodex verify show --unit <unit_id> [--json]",
    "  supercodex uat generate --unit <slice_unit_id>",
    "  supercodex next-action show [--json]",
    "  supercodex next-action dispatch",
  ].join("\n");
}

function writeJson(writer: (text: string) => void, value: unknown): void {
  writer(`${JSON.stringify(value, null, 2)}\n`);
}

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function requireOption(args: string[], name: string): string {
  const value = getOption(args, name);
  if (!value) {
    throw new Error(`Missing required option ${name}.`);
  }

  return value;
}

function parseDependsOn(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isPhase(value: string): value is Phase {
  return PHASES.includes(value as Phase);
}

function isUnitType(value: string): value is UnitType {
  return UNIT_TYPES.includes(value as UnitType);
}

function isQueueStatus(value: string): value is QueueStatus {
  return QUEUE_STATUSES.includes(value as QueueStatus);
}

function isRuntimeId(value: string): value is RuntimeId {
  return RUNTIME_IDS.includes(value as RuntimeId);
}

function seedCurrentState(root: string): CurrentState {
  const state = loadCurrentState(root);
  const seeded: CurrentState = {
    ...state,
    project_root: root,
  };
  validateCurrentState(seeded);
  saveCurrentState(root, seeded);
  return seeded;
}

function seedInitialTransition(root: string, force = false): CurrentState {
  const state = loadCurrentState(root);
  const transitions = loadTransitions(root);
  if (!force && state.last_transition_at && transitions.length > 0) {
    return state;
  }

  const timestamp = new Date().toISOString();
  const transition: TransitionRecord = {
    timestamp,
    from_phase: "intake",
    to_phase: state.phase,
    reason: "Phase 1 scaffold initialized",
    actor: "init",
    unit_id: state.queue_head ?? state.active_milestone ?? undefined,
    queue_head: state.queue_head,
    blocked: state.blocked,
    awaiting_human: state.awaiting_human,
  };
  seedTransitionHistory(root, transition);
  const seeded: CurrentState = {
    ...state,
    last_transition_at: timestamp,
  };
  saveCurrentState(root, seeded);
  return seeded;
}

async function handleInit(root: string, writeOut: (text: string) => void): Promise<number> {
  const syncResult = syncManagedTemplates(root);
  writeSchemaFiles(root);
  seedCurrentState(root);
  const forceTransitionSeed =
    syncResult.created.includes(".supercodex/state/current.json") ||
    syncResult.replaced.includes(".supercodex/state/current.json") ||
    syncResult.created.includes(".supercodex/state/transitions.jsonl") ||
    syncResult.replaced.includes(".supercodex/state/transitions.jsonl");
  seedInitialTransition(root, forceTransitionSeed);

  const reconciled = reconcileState(root);
  writeJson(writeOut, {
    ...syncResult,
    git_repository: hasGitRepository(root),
    reconciled_state: reconciled,
  });
  return 0;
}

function handleDoctor(root: string, writeOut: (text: string) => void): number {
  const result = runDoctor(root, findPlaceholderFiles(root));
  writeJson(writeOut, result);
  return result.ok ? 0 : 1;
}

function handleState(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];
  if (subcommand === "show") {
    writeJson(writeOut, loadCurrentState(root));
    return 0;
  }

  if (subcommand === "reconcile") {
    writeJson(writeOut, reconcileState(root));
    return 0;
  }

  if (subcommand === "transition") {
    const phaseValue = requireOption(args, "--to");
    if (!isPhase(phaseValue)) {
      throw new Error(`Unsupported phase: ${phaseValue}`);
    }

    const reason = requireOption(args, "--reason");
    const unit = getOption(args, "--unit");
    const state = transitionState(root, phaseValue, reason, unit);
    writeJson(writeOut, state);
    return 0;
  }

  throw new Error(`Unknown state subcommand: ${subcommand ?? "<missing>"}`);
}

function handleQueue(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "list") {
    writeJson(writeOut, loadQueueState(root));
    return 0;
  }

  if (subcommand === "next") {
    writeJson(writeOut, computeNextEligibleItem(loadQueueState(root)));
    return 0;
  }

  if (subcommand === "add") {
    const unitId = args[1];
    if (!unitId) {
      throw new Error("Missing queue item unit id.");
    }

    const unitTypeValue = requireOption(args, "--type");
    if (!isUnitType(unitTypeValue)) {
      throw new Error(`Unsupported unit type: ${unitTypeValue}`);
    }

    const statusValue = getOption(args, "--status") ?? "ready";
    if (!isQueueStatus(statusValue)) {
      throw new Error(`Unsupported queue status: ${statusValue}`);
    }

    const item: QueueItem = {
      unit_id: unitId,
      unit_type: unitTypeValue,
      status: statusValue,
      depends_on: parseDependsOn(getOption(args, "--depends-on")),
      enqueued_at: new Date().toISOString(),
      milestone_id: getOption(args, "--milestone"),
      slice_id: getOption(args, "--slice"),
      task_id: getOption(args, "--task"),
      notes: getOption(args, "--notes"),
    };

    writeJson(writeOut, addQueueItem(root, item));
    return 0;
  }

  if (subcommand === "mark-done") {
    const unitId = args[1];
    if (!unitId) {
      throw new Error("Missing queue item unit id.");
    }

    writeJson(writeOut, markQueueItemDone(root, unitId));
    return 0;
  }

  if (subcommand === "remove") {
    const unitId = args[1];
    if (!unitId) {
      throw new Error("Missing queue item unit id.");
    }

    writeJson(writeOut, removeQueueItem(root, unitId));
    return 0;
  }

  throw new Error(`Unknown queue subcommand: ${subcommand ?? "<missing>"}`);
}

function handleLock(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "list") {
    writeJson(writeOut, loadLocks(root));
    return 0;
  }

  if (subcommand === "acquire") {
    const resource = args[1];
    if (!resource) {
      throw new Error("Missing lock resource.");
    }

    const record: LockRecord = {
      resource,
      owner: requireOption(args, "--owner"),
      scope: requireOption(args, "--scope"),
      reason: requireOption(args, "--reason"),
      acquired_at: new Date().toISOString(),
    };

    const acquired = acquireLock(root, record);
    reconcileState(root);
    writeJson(writeOut, acquired);
    return 0;
  }

  if (subcommand === "release") {
    const resource = args[1];
    if (!resource) {
      throw new Error("Missing lock resource.");
    }

    const released = releaseLock(root, resource);
    reconcileState(root);
    writeJson(writeOut, { released });
    return 0;
  }

  throw new Error(`Unknown lock subcommand: ${subcommand ?? "<missing>"}`);
}

async function handleRuntime(args: string[], root: string, writeOut: (text: string) => void): Promise<number> {
  const subcommand = args[0];

  if (subcommand === "list") {
    writeJson(writeOut, listRuntimeRegistry(root));
    return 0;
  }

  if (subcommand === "probe") {
    const runtimeValue = args[1];
    if (runtimeValue && !isRuntimeId(runtimeValue)) {
      throw new Error(`Unsupported runtime: ${runtimeValue}`);
    }

    writeJson(writeOut, await probeRuntimes(root, runtimeValue as RuntimeId | undefined));
    return 0;
  }

  if (subcommand === "dispatch") {
    const runtimeValue = requireOption(args, "--runtime");
    if (!isRuntimeId(runtimeValue)) {
      throw new Error(`Unsupported runtime: ${runtimeValue}`);
    }

    const packetPath = resolvePacketPath(root, requireOption(args, "--packet"));
    const packet = loadDispatchPacket(packetPath);
    const result = await getRuntimeAdapter(runtimeValue).dispatch(root, packet);
    writeJson(writeOut, result);
    return 0;
  }

  if (subcommand === "collect") {
    const runId = requireOption(args, "--run-id");
    const handle = loadRuntimeRunHandle(root, runId);
    writeJson(writeOut, getRuntimeAdapter(handle.runtime).collect(root, runId));
    return 0;
  }

  if (subcommand === "resume") {
    const runId = requireOption(args, "--run-id");
    const prompt = getOption(args, "--prompt");
    const handle = loadRuntimeRunHandle(root, runId);
    writeJson(writeOut, await getRuntimeAdapter(handle.runtime).resume(root, runId, prompt));
    return 0;
  }

  if (subcommand === "cancel") {
    const runId = requireOption(args, "--run-id");
    const handle = loadRuntimeRunHandle(root, runId);
    writeJson(writeOut, {
      cancelled: await getRuntimeAdapter(handle.runtime).cancel(root, runId),
    });
    return 0;
  }

  throw new Error(`Unknown runtime subcommand: ${subcommand ?? "<missing>"}`);
}

function handlePlan(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "sync") {
    const result = syncPlanningQueue(root);
    const reconciled = reconcileState(root);
    writeJson(writeOut, {
      ...result,
      reconciled_state: reconciled,
    });
    return 0;
  }

  if (subcommand === "validate") {
    const unitId = getOption(args, "--unit");
    const validations = validatePlanningSurface(root, unitId);
    writeJson(writeOut, {
      ok: validations.every((validation) => validation.ok),
      validations,
    });
    return validations.every((validation) => validation.ok) ? 0 : 1;
  }

  throw new Error(`Unknown plan subcommand: ${subcommand ?? "<missing>"}`);
}

function handleParallel(args: string[], root: string, writeOut: (text: string) => void): Promise<number> | number {
  const subcommand = args[0];

  if (subcommand === "show") {
    writeJson(writeOut, showParallel(root));
    return 0;
  }

  if (subcommand === "dispatch") {
    const workers = getOption(args, "--workers");
    if (workers && (!/^\d+$/.test(workers) || Number.parseInt(workers, 10) <= 0)) {
      throw new Error(`Invalid worker count: ${workers}`);
    }

    return dispatchParallel(root, workers ? Number.parseInt(workers, 10) : undefined).then((result) => {
      writeJson(writeOut, result);
      return 0;
    });
  }

  throw new Error(`Unknown parallel subcommand: ${subcommand ?? "<missing>"}`);
}

async function handleIntegrate(args: string[], root: string, writeOut: (text: string) => void): Promise<number> {
  const subcommand = args[0];

  if (subcommand === "show") {
    writeJson(writeOut, showIntegration(root));
    return 0;
  }

  if (subcommand === "run") {
    writeJson(writeOut, await runIntegration(root, getOption(args, "--unit")));
    return 0;
  }

  throw new Error(`Unknown integrate subcommand: ${subcommand ?? "<missing>"}`);
}

function handleVerify(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "show") {
    const unitId = requireOption(args, "--unit");
    const result = getTaskVerificationState(root, unitId);
    if (args.includes("--json")) {
      writeJson(writeOut, result);
    } else {
      writeOut(`${formatTaskVerificationState(result)}\n`);
    }
    return 0;
  }

  throw new Error(`Unknown verify subcommand: ${subcommand ?? "<missing>"}`);
}

function handleUat(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "generate") {
    const unitId = requireOption(args, "--unit");
    const ref = generateSliceUat(root, unitId);
    writeJson(writeOut, {
      unit_id: unitId,
      ref,
    });
    return 0;
  }

  throw new Error(`Unknown uat subcommand: ${subcommand ?? "<missing>"}`);
}

function handleRecover(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];
  const runId = getOption(args, "--run-id");

  if (subcommand === "show") {
    writeJson(writeOut, assessRecovery(root, runId));
    return 0;
  }

  if (subcommand === "reconcile") {
    const assessment = reconcileRecovery(root, runId);
    writeJson(writeOut, {
      assessment,
      reconciled_state: loadCurrentState(root),
    });
    return 0;
  }

  throw new Error(`Unknown recover subcommand: ${subcommand ?? "<missing>"}`);
}

function handleAudit(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "memory") {
    const unitId = requireOption(args, "--unit");
    writeJson(writeOut, runMemoryAudit(root, unitId));
    return 0;
  }

  if (subcommand === "postmortem") {
    const runId = requireOption(args, "--run-id");
    writeJson(writeOut, runPostmortem(root, runId));
    return 0;
  }

  throw new Error(`Unknown audit subcommand: ${subcommand ?? "<missing>"}`);
}

function handleLearning(args: string[], root: string, writeOut: (text: string) => void): number {
  const subcommand = args[0];

  if (subcommand === "show") {
    writeJson(writeOut, showLearning(root));
    return 0;
  }

  if (subcommand === "run") {
    const unitId = getOption(args, "--unit");
    const runId = getOption(args, "--run-id");
    if (!!unitId === !!runId) {
      throw new Error("learning run requires exactly one of --unit or --run-id.");
    }

    if (unitId) {
      writeJson(writeOut, runLearningCycle(root, unitId));
      return 0;
    }

    writeJson(writeOut, createProcessImprovementReport(root, runId!));
    return 0;
  }

  if (subcommand === "skills") {
    const state = loadLearningState(root);
    writeJson(writeOut, {
      state,
      skill_health: showLearning(root).skill_health,
    });
    return 0;
  }

  if (subcommand === "patterns") {
    writeJson(writeOut, listPatternCandidates(root));
    return 0;
  }

  throw new Error(`Unknown learning subcommand: ${subcommand ?? "<missing>"}`);
}

async function handleNextAction(args: string[], root: string, writeOut: (text: string) => void): Promise<number> {
  const subcommand = args[0];

  if (subcommand === "show") {
    const result = synthesizeNextAction(root);
    if (args.includes("--json")) {
      writeJson(writeOut, result);
    } else {
      writeOut(formatNextActionShow(result));
    }
    return 0;
  }

  if (subcommand === "dispatch") {
    writeJson(writeOut, await dispatchNextAction(root));
    return 0;
  }

  throw new Error(`Unknown next-action subcommand: ${subcommand ?? "<missing>"}`);
}

export async function runCli(argv: string[], options: CliOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const writeOut = options.writeOut ?? ((text: string) => process.stdout.write(text));
  const writeErr = options.writeErr ?? ((text: string) => process.stderr.write(text));
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "init":
        return await handleInit(cwd, writeOut);
      case "doctor":
        return handleDoctor(cwd, writeOut);
      case "state":
        return handleState(rest, cwd, writeOut);
      case "queue":
        return handleQueue(rest, cwd, writeOut);
      case "lock":
        return handleLock(rest, cwd, writeOut);
      case "runtime":
        return await handleRuntime(rest, cwd, writeOut);
      case "recover":
        return handleRecover(rest, cwd, writeOut);
      case "audit":
        return handleAudit(rest, cwd, writeOut);
      case "learning":
        return handleLearning(rest, cwd, writeOut);
      case "plan":
        return handlePlan(rest, cwd, writeOut);
      case "parallel":
        return await handleParallel(rest, cwd, writeOut);
      case "integrate":
        return await handleIntegrate(rest, cwd, writeOut);
      case "verify":
        return handleVerify(rest, cwd, writeOut);
      case "uat":
        return handleUat(rest, cwd, writeOut);
      case "next-action":
        return await handleNextAction(rest, cwd, writeOut);
      default:
        writeErr(`${usage()}\n`);
        return command ? 1 : 0;
    }
  } catch (error) {
    writeErr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}
