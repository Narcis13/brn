import { readJsonFile, readTextIfExists, writeJsonFile, writeTextAtomic } from "../fs.js";
import { runMemoryAudit, runPostmortem } from "../audit/index.js";
import { recordLearningError, runLearningCycle } from "../learning/index.js";
import {
  expectedArtifactsForUnit,
  isModernSlice,
  loadTaskArtifact,
  parseUnitId,
  syncPlanningQueue,
  validatePlanningUnit,
} from "../planning/index.js";
import { resolveRepoPath } from "../paths.js";
import {
  assessRecovery,
  buildContinuationPacket,
  saveContinuationArtifacts,
  writeRecoveryCheckpoint,
} from "../recovery/index.js";
import { getRuntimeAdapter } from "../runtime/adapters.js";
import { renderDispatchPrompt, renderResumePrompt } from "../runtime/prompts.js";
import { createRunId, loadRuntimeRunHandle } from "../runtime/runs.js";
import { loadRuntimeRegistry } from "../runtime/registry.js";
import type { DispatchPacket, NormalizedResult, RuntimeId, RuntimeRunHandle, RuntimeRegistry } from "../runtime/types.js";
import {
  computeNextEligibleItem,
  loadCurrentState,
  loadQueueState,
  markQueueItemDone,
  reconcileState,
  saveCurrentState,
  transitionState,
} from "../state.js";
import {
  generateSliceUat,
  getTaskVerificationPaths,
  getTaskVerificationState,
  refreshSliceSummary,
  reviewReportRef,
  writeTaskCompletionArtifacts,
} from "../verify/index.js";
import {
  getCanonicalRunPaths,
  loadLatestCanonicalRunForUnit,
  saveCanonicalRunRecord,
  saveContextManifestFile,
  saveNextActionDecisionFile,
  savePromptFile,
  saveStateSnapshot,
  listCanonicalRunRecordsForUnit,
} from "./runs.js";
import { validateContextManifest, validateNextActionDecision } from "./schemas.js";
import type {
  CanonicalRunGitSnapshot,
  CanonicalRunRecord,
  ContextManifest,
  NextActionDecision,
  NextActionDispatchResult,
  NextActionShowResult,
} from "./types.js";
import type { CurrentState, QueueItem, UnitType } from "../types.js";

interface RuntimeRoutingConfig {
  version: number;
  default_policy_ref: string;
  task_class_overrides: Record<string, { preferred_runtime?: RuntimeId; preferred_role?: string }>;
}

interface ExecutionTarget {
  decision_unit_type: UnitType;
  packet_unit_type: string;
  role: string;
  reviewer_pass: string | null;
}

const MAX_RETRIES_BY_UNIT_TYPE: Partial<Record<UnitType, number>> = {
  milestone: 1,
  slice: 2,
  task: 2,
  discovery: 1,
  mapping: 1,
  research: 1,
  verification: 2,
  review: 1,
  integration: 1,
  summarization: 1,
  roadmap: 1,
  audit: 1,
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    if (!seen.has(value)) {
      seen.add(value);
      items.push(value);
    }
  }

  return items;
}

function readMarkdown(root: string, ref: string): string {
  return readTextIfExists(resolveRepoPath(root, ref)) ?? "";
}

function extractBulletItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim());
}

function extractObjective(text: string): string | null {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("#") || line.startsWith("## ")) {
      continue;
    }

    if (line.startsWith("Demo sentence:")) {
      const value = line.replace("Demo sentence:", "").trim();
      return value || null;
    }

    if (line.startsWith("Status:")) {
      continue;
    }

    if (line.startsWith("- ")) {
      continue;
    }

    return line;
  }

  return null;
}

function extractCodeRefs(text: string): string[] {
  const refs: string[] = [];
  const regex = /`([^`]+)`/g;

  for (const match of text.matchAll(regex)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }

    if (value.includes("/") || /\.(?:md|json|ts|tsx|js|mjs|cjs|sh)$/.test(value)) {
      refs.push(value);
    }
  }

  return unique(refs);
}

function extractCommands(text: string): string[] {
  const commands: string[] = [];
  const regex = /`([^`]+)`/g;

  for (const match of text.matchAll(regex)) {
    const value = match[1]?.trim();
    if (!value) {
      continue;
    }

    if (/^(pnpm|npm|npx|vitest|tsx)\b/.test(value) || /\btest\b/.test(value)) {
      commands.push(value);
    }
  }

  return unique(commands);
}

function isPathPresent(root: string, ref: string): boolean {
  return !!readTextIfExists(resolveRepoPath(root, ref));
}

function matchesActiveTask(current: CurrentState, item: QueueItem): boolean {
  const parsed = parseUnitId(item.unit_id);
  return (
    parsed.kind === "task" &&
    current.active_milestone === parsed.milestone_id &&
    current.active_slice === parsed.slice_id &&
    current.active_task === parsed.task_id
  );
}

function resolveUnitArtifacts(root: string, item: QueueItem): { unit: string[]; milestone: string[] } {
  const parsed = parseUnitId(item.unit_id);
  const milestoneId = item.milestone_id ?? parsed.milestone_id;
  const sliceId = item.slice_id ?? parsed.slice_id;
  const taskId = item.task_id ?? parsed.task_id;

  if (parsed.kind === "roadmap" || item.unit_type === "roadmap") {
    return {
      unit: ["vault/roadmap.md"].filter((ref) => isPathPresent(root, ref)),
      milestone: [],
    };
  }

  const milestoneRefs = milestoneId
    ? [
        `vault/milestones/${milestoneId}/milestone.md`,
        `vault/milestones/${milestoneId}/boundary-map.md`,
        `vault/milestones/${milestoneId}/summary.md`,
        `vault/milestones/${milestoneId}/uat.md`,
      ].filter((ref) => isPathPresent(root, ref))
    : [];

  if (taskId && milestoneId && sliceId) {
    return {
      unit: [
        `vault/milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/boundary-map.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/plan.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/summary.md`,
      ].filter((ref) => isPathPresent(root, ref)),
      milestone: milestoneRefs,
    };
  }

  if (sliceId && milestoneId) {
    return {
      unit: [
        `vault/milestones/${milestoneId}/slices/${sliceId}/slice.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/boundary-map.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/research.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/plan.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/review.md`,
        `vault/milestones/${milestoneId}/slices/${sliceId}/summary.md`,
      ].filter((ref) => isPathPresent(root, ref)),
      milestone: milestoneRefs,
    };
  }

  return {
    unit: milestoneRefs,
    milestone: milestoneRefs,
  };
}

function loadRoutingConfig(root: string): RuntimeRoutingConfig {
  return readJsonFile<RuntimeRoutingConfig>(resolveRepoPath(root, ".supercodex/runtime/routing.json"));
}

function defaultRoleForItem(root: string, current: CurrentState, item: QueueItem): string {
  switch (item.unit_type) {
    case "milestone":
    case "roadmap":
      return "strategist";
    case "slice":
      if (item.milestone_id && item.slice_id && isModernSlice(root, item.milestone_id, item.slice_id)) {
        return validatePlanningUnit(root, item.unit_id).ok ? "implementer" : "slice-planner";
      }
      return current.phase === "plan" || current.phase === "dispatch" || current.phase === "recover"
        ? "implementer"
        : "integrator";
    case "task":
      return current.phase === "plan" || current.phase === "dispatch" || current.phase === "recover"
        ? "implementer"
        : "integrator";
    case "discovery":
      return "interviewer";
    case "mapping":
      return "mapper";
    case "research":
      return "researcher";
    case "verification":
      return "verifier";
    case "review":
      return "reviewers";
    case "integration":
      return "integrator";
    case "summarization":
      return "maintenance";
    case "audit":
      return "maintenance";
    default:
      return "implementer";
  }
}

function resolveExecutionTarget(root: string, current: CurrentState, item: QueueItem): ExecutionTarget {
  if (item.unit_type !== "task" || !matchesActiveTask(current, item)) {
    return {
      decision_unit_type: item.unit_type,
      packet_unit_type: item.unit_type,
      role: defaultRoleForItem(root, current, item),
      reviewer_pass: null,
    };
  }

  const verificationState = getTaskVerificationState(root, item.unit_id);
  if (current.phase === "review" || (current.phase === "recover" && verificationState.status === "review")) {
    return {
      decision_unit_type: "review",
      packet_unit_type: "review",
      role: "reviewers",
      reviewer_pass: verificationState.next_reviewer,
    };
  }

  if (current.phase === "verify" || (current.phase === "recover" && verificationState.status === "verify")) {
    return {
      decision_unit_type: "verification",
      packet_unit_type: "verification",
      role: "verifier",
      reviewer_pass: null,
    };
  }

  return {
    decision_unit_type: "task",
    packet_unit_type: "task",
    role: "implementer",
    reviewer_pass: null,
  };
}

function chooseRuntime(
  registry: RuntimeRegistry,
  preferredRuntime: RuntimeId | undefined,
  role: string,
): RuntimeId | null {
  const preferenceOrder: RuntimeId[] = preferredRuntime
    ? [preferredRuntime, ...(preferredRuntime === "claude" ? (["codex"] as const) : (["claude"] as const))]
    : ["codex", "claude"];

  const reasoningFirst = new Set([
    "strategist",
    "interviewer",
    "mapper",
    "researcher",
    "reviewers",
    "maintenance",
    "slice-planner",
    "task-framer",
  ]);
  if (!preferredRuntime && reasoningFirst.has(role)) {
    preferenceOrder.splice(0, preferenceOrder.length, "claude", "codex");
  }

  const candidates = preferenceOrder.filter((runtimeId, index, array) => array.indexOf(runtimeId) === index) as RuntimeId[];
  const available = candidates.filter((runtimeId) => {
    const entry = registry.runtimes[runtimeId];
    return entry.enabled && entry.configured;
  });

  if (available.length === 0) {
    return null;
  }

  const withPositiveProbe = available.filter((runtimeId) => registry.runtimes[runtimeId].last_probe?.available !== false);
  return (withPositiveProbe[0] ?? available[0]) as RuntimeId;
}

function buildContextManifest(
  root: string,
  current: CurrentState,
  item: QueueItem,
  decision: NextActionDecision,
  latestRun: CanonicalRunRecord | null,
): ContextManifest {
  const resolved = resolveUnitArtifacts(root, item);
  const systemRefs = [
    "SUPER_CODEX.md",
    ".supercodex/state/current.json",
    ".supercodex/state/queue.json",
    ".supercodex/runtime/adapters.json",
    ".supercodex/runtime/policies.json",
    ".supercodex/runtime/routing.json",
    ".supercodex/prompts/next-action.md",
  ];
  const supportingRefs = ["vault/decisions.md"];

  if (current.context_profile !== "budget") {
    supportingRefs.push("vault/assumptions.md", "vault/index.md", "vault/feedback/ANSWERS.md");
  }

  if (current.context_profile === "quality") {
    supportingRefs.push(
      "vault/architecture.md",
      "vault/constraints.md",
      "vault/roadmap.md",
      "vault/feedback/QUESTIONS.md",
      "vault/feedback/BLOCKERS.md",
      ".supercodex/state/transitions.jsonl",
    );
  }

  if (item.unit_type === "task") {
    const verificationState = getTaskVerificationState(root, item.unit_id);
    if (verificationState.implementation_run_id) {
      supportingRefs.push(
        getCanonicalRunPaths(verificationState.implementation_run_id).record_ref,
        getCanonicalRunPaths(verificationState.implementation_run_id).normalized_ref,
      );
    }

    if (decision.unit_type === "verification") {
      supportingRefs.push(getTaskVerificationPaths(item.unit_id).verification_ref);
    }

    if (decision.unit_type === "review") {
      supportingRefs.push(getTaskVerificationPaths(item.unit_id).verification_ref);
      if (decision.reviewer_pass) {
        supportingRefs.push(reviewReportRef(item.unit_id, decision.reviewer_pass));
      }
    }
  }

  const retryRefs =
    latestRun === null
      ? []
      : unique(
          [
            getCanonicalRunPaths(latestRun.run_id).record_ref,
            latestRun.context_ref,
            latestRun.normalized_ref ?? "",
            latestRun.continuation_ref,
          ].filter(Boolean),
        );

  const manifest: ContextManifest = {
    version: 1,
    unit_id: item.unit_id,
    context_profile: current.context_profile,
    layers: {
      system: systemRefs.filter((ref) => isPathPresent(root, ref)),
      unit: resolved.unit,
      milestone: resolved.milestone,
      supporting: unique(supportingRefs).filter((ref) => isPathPresent(root, ref)),
      retry: retryRefs.filter((ref) => isPathPresent(root, ref)),
    },
    refs: unique([
      ...systemRefs.filter((ref) => isPathPresent(root, ref)),
      ...resolved.unit,
      ...resolved.milestone,
      ...unique(supportingRefs).filter((ref) => isPathPresent(root, ref)),
      ...retryRefs.filter((ref) => isPathPresent(root, ref)),
    ]),
  };

  validateContextManifest(manifest);
  return manifest;
}

function buildDispatchPacket(root: string, item: QueueItem, decision: NextActionDecision, manifest: ContextManifest): DispatchPacket {
  const role = decision.role ?? "implementer";
  const resolved = resolveUnitArtifacts(root, item);
  const parsed = parseUnitId(item.unit_id);
  const texts = manifest.refs.map((ref) => readMarkdown(root, ref));
  const unitTexts = resolved.unit.map((ref) => readMarkdown(root, ref));
  const milestoneTexts = resolved.milestone.map((ref) => readMarkdown(root, ref));

  const objective =
    unitTexts.map(extractObjective).find((value): value is string => Boolean(value)) ??
    milestoneTexts.map(extractObjective).find((value): value is string => Boolean(value)) ??
    item.notes ??
    `Advance ${item.unit_id} in a bounded, verifiable way.`;

  const planRef = resolved.unit.find((ref) => ref.endsWith("/plan.md") || ref.endsWith("plan.md"));
  const reviewRef = resolved.unit.find((ref) => ref.endsWith("/review.md") || ref.endsWith("review.md"));
  const planText = planRef ? readMarkdown(root, planRef) : "";
  const reviewText = reviewRef ? readMarkdown(root, reviewRef) : "";
  const boundaryText = milestoneTexts.join("\n");
  const planningRole = role === "strategist" || role === "slice-planner" || role === "task-framer";
  const verificationState = parsed.kind === "task" ? getTaskVerificationState(root, item.unit_id) : null;
  const verificationPaths = parsed.kind === "task" ? getTaskVerificationPaths(item.unit_id) : null;
  const implementationRefs =
    verificationState?.implementation_run_id
      ? [
          getCanonicalRunPaths(verificationState.implementation_run_id).record_ref,
          getCanonicalRunPaths(verificationState.implementation_run_id).normalized_ref,
        ]
      : [];
  const requiredReviewers = verificationState?.required_reviewers ?? [];

  let taskArtifact: ReturnType<typeof loadTaskArtifact> | null = null;
  if (parsed.kind === "task" && parsed.milestone_id && parsed.slice_id && parsed.task_id) {
    try {
      taskArtifact = loadTaskArtifact(root, parsed.milestone_id, parsed.slice_id, parsed.task_id);
    } catch {
      taskArtifact = null;
    }
  }

  let acceptanceCriteria = (
    taskArtifact
      ? taskArtifact.acceptance_criteria
      : unique([
          ...extractBulletItems(planText),
          ...extractBulletItems(reviewText),
        ])
  ).slice(0, 8);

  let filesInScope = unique(
    taskArtifact
      ? [...taskArtifact.likely_files, ...resolved.unit, ...resolved.milestone, ...implementationRefs]
      : [
          ...texts.flatMap(extractCodeRefs),
          ...resolved.unit,
          ...resolved.milestone,
          ...(planningRole ? expectedArtifactsForUnit(root, item.unit_id) : []),
        ],
  );

  let tests = unique(
    taskArtifact
      ? taskArtifact.verification_plan.filter((entry) => /^(pnpm|npm|npx|vitest|tsx)\b/.test(entry))
      : texts.flatMap(extractCommands),
  );
  let verificationPlan = unique(
    taskArtifact
      ? taskArtifact.verification_plan
      : [
          ...extractBulletItems(reviewText),
          ...extractBulletItems(boundaryText).filter((line) => /validate|inspect|verify|review|schema/i.test(line)),
          "Run the most relevant automated checks for the bounded unit.",
          "Inspect persisted evidence and blockers before claiming completion.",
        ],
  );

  let constraints = unique(
    taskArtifact
      ? [
          `Why now: ${taskArtifact.why_now}`,
          `TDD mode: ${taskArtifact.tdd_mode}`,
          ...(taskArtifact.tdd_justification ? [`TDD justification: ${taskArtifact.tdd_justification}`] : []),
          ...(requiredReviewers.length > 0 ? [`Reviewer passes: ${requiredReviewers.join(", ")}`] : []),
          "Use disk-backed state and files as ground truth rather than prior chat context.",
          "Do not claim verified completion without evidence in the normalized result.",
        ]
      : [
          ...extractBulletItems(boundaryText),
          "Use disk-backed state and files as ground truth rather than prior chat context.",
          "Do not claim verified completion without evidence in the normalized result.",
        ],
  ).slice(0, 8);

  const safetyClass = taskArtifact
    ? taskArtifact.safety_class
    : filesInScope.some((ref) => ref === "package.json" || ref.includes(".supercodex/schemas/"))
      ? "semi_reversible"
      : "reversible";

  let artifactsToUpdate = unique(
    taskArtifact
      ? [...expectedArtifactsForUnit(root, item.unit_id), "vault/assumptions.md"]
      : [
          ...(planningRole ? expectedArtifactsForUnit(root, item.unit_id) : []),
          ...resolved.unit.filter((ref) => ref.endsWith("summary.md") || ref.endsWith("review.md")),
          ...resolved.milestone.filter((ref) => ref.endsWith("summary.md")),
          "vault/assumptions.md",
        ],
  );

  if (taskArtifact && verificationPaths && decision.unit_type === "verification") {
    acceptanceCriteria = unique([
      ...taskArtifact.acceptance_criteria,
      `Write a machine-readable verification report to ${verificationPaths.verification_ref}.`,
    ]);
    filesInScope = unique([...filesInScope, verificationPaths.verification_ref]);
    tests =
      taskArtifact.verification_ladder.focused_tests.length > 0
        ? [...taskArtifact.verification_ladder.focused_tests]
        : tests;
    verificationPlan = unique([
      ...taskArtifact.verification_plan,
      `Persist the verification verdict to ${verificationPaths.verification_ref}.`,
    ]);
    constraints = unique([
      `TDD mode: ${taskArtifact.tdd_mode}`,
      ...(taskArtifact.tdd_justification ? [`TDD justification: ${taskArtifact.tdd_justification}`] : []),
      `Required reviewer passes: ${requiredReviewers.join(", ")}`,
      "Inspect the latest successful implementation run before deciding whether the task can progress.",
      `Write machine-readable JSON to ${verificationPaths.verification_ref}.`,
    ]);
    artifactsToUpdate = [verificationPaths.verification_ref];
  }

  if (taskArtifact && verificationPaths && decision.unit_type === "review") {
    const reviewArtifactRef = reviewReportRef(item.unit_id, decision.reviewer_pass ?? "review");
    acceptanceCriteria = unique([
      ...taskArtifact.acceptance_criteria,
      `Write a ${decision.reviewer_pass ?? "required"} review report to ${reviewArtifactRef}.`,
    ]);
    filesInScope = unique([...filesInScope, verificationPaths.verification_ref, reviewArtifactRef]);
    tests =
      taskArtifact.verification_ladder.focused_tests.length > 0
        ? [...taskArtifact.verification_ladder.focused_tests]
        : tests;
    verificationPlan = unique([
      `Inspect ${verificationPaths.verification_ref} before issuing findings.`,
      ...taskArtifact.verification_plan,
    ]);
    constraints = unique([
      `Reviewer pass: ${decision.reviewer_pass ?? "required"}`,
      "Keep findings scoped to the requested reviewer persona.",
      `Write machine-readable JSON to ${reviewArtifactRef}.`,
      "Do not request another implementation pass unless a concrete finding remains unresolved.",
    ]);
    artifactsToUpdate = [reviewArtifactRef];
  }

  const packet: DispatchPacket = {
    version: 1,
    unit_id: item.unit_id,
    unit_type: decision.unit_type ?? item.unit_type,
    role,
    objective:
      taskArtifact && verificationPaths && decision.unit_type === "verification"
        ? `Verify ${item.unit_id} against its task contract, TDD mode, and recorded evidence.`
        : taskArtifact && verificationPaths && decision.unit_type === "review"
          ? `Review ${item.unit_id} from the ${decision.reviewer_pass ?? "required"} perspective.`
          : taskArtifact?.objective ?? objective,
    context_refs: manifest.refs,
    acceptance_criteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [taskArtifact?.objective ?? objective],
    files_in_scope:
      filesInScope.length > 0
        ? filesInScope
        : planningRole
          ? expectedArtifactsForUnit(root, item.unit_id)
          : ["src/", ".supercodex/", "vault/"],
    tests: tests.length > 0 ? tests : ["pnpm test"],
    verification_plan: verificationPlan,
    constraints,
    safety_class: safetyClass,
    git_context: {
      control_root: root,
      workspace_root: root,
      milestone_branch: loadCurrentState(root).git.milestone_branch,
      task_branch: loadCurrentState(root).git.task_branch,
      base_commit: loadCurrentState(root).git.base_commit,
    },
    owned_resources: taskArtifact?.likely_files.length ? [...taskArtifact.likely_files] : [],
    output_contract: {
      must_update_artifacts: true,
      must_produce_evidence: true,
      must_not_claim_done_without_verification: true,
      notes: [
        "Return a machine-parseable JSON object.",
        "List blockers and assumptions explicitly instead of burying them in prose.",
        ...(decision.unit_type === "verification" && verificationPaths
          ? [`Update ${verificationPaths.verification_ref} before reporting success.`]
          : []),
        ...(decision.unit_type === "review" && decision.reviewer_pass
          ? [`Update ${reviewReportRef(item.unit_id, decision.reviewer_pass)} before reporting success.`]
          : []),
      ],
    },
    stop_conditions: [
      "Pause if the selected unit conflicts with current disk state or lock ownership.",
      "Pause if execution would require an irreversible action or unsafe assumption.",
      "Pause if the runtime cannot return a machine-parseable response.",
    ],
    artifacts_to_update: artifactsToUpdate,
  };

  return packet;
}

function buildPromptPreview(decision: NextActionDecision, packet: DispatchPacket): string {
  if (decision.action === "resume") {
    return renderResumePrompt(packet);
  }

  return renderDispatchPrompt(packet);
}

function gitSnapshot(state: CurrentState): CanonicalRunGitSnapshot {
  return {
    trunk_branch: state.git.trunk_branch,
    milestone_branch: state.git.milestone_branch,
    task_branch: state.git.task_branch,
    worktree_path: state.git.worktree_path,
    base_commit: state.git.base_commit,
    head_commit: state.git.head_commit,
    dirty: state.git.dirty,
  };
}

function countRetries(root: string, unitId: string): number {
  return listCanonicalRunRecordsForUnit(root, unitId).filter((record) => record.status !== "success").length;
}

function nextActionForUnit(
  root: string,
  current: CurrentState,
  item: QueueItem,
  registry: RuntimeRegistry,
): NextActionDecision {
  const routing = loadRoutingConfig(root);
  const executionTarget = resolveExecutionTarget(root, current, item);
  const override = routing.task_class_overrides[executionTarget.decision_unit_type] ?? {};
  const latestRun = loadLatestCanonicalRunForUnit(root, item.unit_id);
  const retryCount = countRetries(root, item.unit_id);
  const recoveryAssessment = latestRun?.status === "interrupted" ? assessRecovery(root, latestRun.run_id) : null;

  if (current.current_run_id) {
    try {
      const activeHandle = loadRuntimeRunHandle(root, current.current_run_id);
      if (activeHandle.status === "running") {
        return {
          version: 1,
          action: "none",
          unit_id: item.unit_id,
          unit_type: item.unit_type,
          phase: current.phase,
          role: null,
          runtime: null,
          rationale: [`Run ${current.current_run_id} is still active and must finish before another dispatch starts.`],
          retry_count: retryCount,
          selected_run_id: current.current_run_id,
          context_profile: current.context_profile,
          reviewer_pass: executionTarget.reviewer_pass,
        };
      }
    } catch {
      // Ignore stale current_run_id references and continue with synthesis.
    }
  }

  if (latestRun?.status === "interrupted" && recoveryAssessment?.recommendation === "resume") {
    return {
      version: 1,
      action: "resume",
      unit_id: item.unit_id,
      unit_type: item.unit_type,
      phase: current.phase,
      role: latestRun.role,
      runtime: latestRun.runtime,
      rationale: [
        `Latest attempt ${latestRun.run_id} was interrupted and recovery assessment approved resume.`,
        recoveryAssessment.summary,
      ],
      retry_count: retryCount,
      selected_run_id: latestRun.run_id,
      context_profile: current.context_profile,
      reviewer_pass: executionTarget.reviewer_pass,
    };
  }

  if (latestRun?.status === "interrupted" && recoveryAssessment?.recommendation === "await_human") {
    return {
      version: 1,
      action: "escalate",
      unit_id: item.unit_id,
      unit_type: item.unit_type,
      phase: current.phase,
      role: null,
      runtime: null,
      rationale: [
        recoveryAssessment.summary,
        ...recoveryAssessment.drifts.map((entry) => entry.message),
      ],
      retry_count: retryCount,
      selected_run_id: latestRun.run_id,
      context_profile: current.context_profile,
      reviewer_pass: executionTarget.reviewer_pass,
    };
  }

  if (
    latestRun?.status === "interrupted" &&
    (recoveryAssessment?.recommendation === "replan" || recoveryAssessment?.recommendation === "restart")
  ) {
    return {
      version: 1,
      action: "none",
      unit_id: item.unit_id,
      unit_type: item.unit_type,
      phase: current.phase,
      role: null,
      runtime: null,
      rationale: [
        recoveryAssessment.summary,
        "Run `supercodex recover reconcile` to move the unit back to plan before dispatching again.",
      ],
      retry_count: retryCount,
      selected_run_id: latestRun.run_id,
      context_profile: current.context_profile,
      reviewer_pass: executionTarget.reviewer_pass,
    };
  }

  if (latestRun?.status === "blocked") {
    return {
      version: 1,
      action: "escalate",
      unit_id: item.unit_id,
      unit_type: item.unit_type,
      phase: current.phase,
      role: null,
      runtime: null,
      rationale: [
        `Latest attempt ${latestRun.run_id} reported a blocker.`,
        "Human input is required before safe continuation.",
        ],
      retry_count: retryCount,
      selected_run_id: latestRun.run_id,
      context_profile: current.context_profile,
      reviewer_pass: executionTarget.reviewer_pass,
    };
  }

  const maxRetries = MAX_RETRIES_BY_UNIT_TYPE[executionTarget.decision_unit_type] ?? 1;
  if (latestRun?.status === "failed" && retryCount >= maxRetries) {
    return {
      version: 1,
      action: "escalate",
      unit_id: item.unit_id,
      unit_type: executionTarget.decision_unit_type,
      phase: current.phase,
      role: null,
      runtime: null,
      rationale: [
        `Latest attempt ${latestRun.run_id} failed and the retry budget (${maxRetries}) is exhausted.`,
        "The conductor should stop and request a human decision or replanning step.",
      ],
      retry_count: retryCount,
      selected_run_id: latestRun.run_id,
      context_profile: current.context_profile,
      reviewer_pass: executionTarget.reviewer_pass,
    };
  }

  const role = override.preferred_role ?? executionTarget.role;
  const preferredRuntime =
    latestRun?.status === "failed" || recoveryAssessment?.recommendation === "dispatch"
      ? latestRun?.runtime ?? override.preferred_runtime
      : override.preferred_runtime;
  const runtime = chooseRuntime(registry, preferredRuntime, role);

  const decision: NextActionDecision = {
    version: 1,
    action: latestRun?.status === "failed" ? "retry" : "dispatch",
    unit_id: item.unit_id,
    unit_type: executionTarget.decision_unit_type,
    phase: current.phase,
    role,
    runtime,
    rationale: [
      `Selected queue head ${item.unit_id} because it is the next eligible ready unit.`,
      latestRun?.status === "failed"
        ? `Retrying after failed attempt ${latestRun.run_id} within the configured retry budget.`
        : recoveryAssessment?.recommendation === "dispatch"
          ? `Recovery assessment for interrupted attempt ${latestRun?.run_id} requires a fresh dispatch instead of runtime resume.`
        : "No higher-priority retry or resume candidate exists for this unit.",
      runtime
        ? `Routed to ${runtime} for role ${role} using the current deterministic routing policy.`
        : "No enabled runtime is currently available for this unit.",
    ],
    retry_count: retryCount,
    selected_run_id: latestRun?.run_id ?? null,
    context_profile: current.context_profile,
    reviewer_pass: executionTarget.reviewer_pass,
  };

  validateNextActionDecision(decision);
  return decision;
}

export function synthesizeNextAction(root: string): NextActionShowResult {
  const current = reconcileState(root);
  const queue = loadQueueState(root);
  const item = computeNextEligibleItem(queue);

  if (current.awaiting_human || current.blocked) {
    return {
      decision: {
        version: 1,
        action: "none",
        unit_id: current.queue_head,
        unit_type: item?.unit_type ?? null,
        phase: current.phase,
        role: null,
        runtime: null,
        rationale: ["State is already blocked or awaiting human input, so no new action will be synthesized."],
        retry_count: 0,
        selected_run_id: current.current_run_id,
        context_profile: current.context_profile,
        reviewer_pass: null,
      },
      context_manifest: null,
      packet: null,
      prompt_preview: null,
    };
  }

  if (!item) {
    return {
      decision: {
        version: 1,
        action: "none",
        unit_id: null,
        unit_type: null,
        phase: current.phase,
        role: null,
        runtime: null,
        rationale: ["The queue has no eligible ready unit."],
        retry_count: 0,
        selected_run_id: current.current_run_id,
        context_profile: current.context_profile,
        reviewer_pass: null,
      },
      context_manifest: null,
      packet: null,
      prompt_preview: null,
    };
  }

  const registry = loadRuntimeRegistry(root);
  const decision = nextActionForUnit(root, current, item, registry);
  if (!decision.runtime || !decision.role || decision.action === "none" || decision.action === "escalate") {
    return {
      decision,
      context_manifest: null,
      packet: null,
      prompt_preview: null,
    };
  }

  const latestRun = loadLatestCanonicalRunForUnit(root, item.unit_id);
  const manifest = buildContextManifest(root, current, item, decision, latestRun);
  const packet = buildDispatchPacket(root, item, decision, manifest);
  return {
    decision,
    context_manifest: manifest,
    packet,
    prompt_preview: buildPromptPreview(decision, packet),
  };
}

function patchStateForRun(root: string, runId: string, runtime: RuntimeId, unitId: string): CurrentState {
  const state = loadCurrentState(root);
  const unitFields = parseUnitId(unitId);
  const nextState: CurrentState = {
    ...state,
    active_milestone: unitFields.milestone_id,
    active_slice: unitFields.slice_id,
    active_task: unitFields.task_id,
    active_runtime: runtime,
    current_run_id: runId,
    recovery_ref: getCanonicalRunPaths(runId).continuation_ref,
  };
  saveCurrentState(root, nextState);
  return nextState;
}

function updateMetrics(root: string, action: NextActionDecision["action"], result: NormalizedResult): void {
  const state = loadCurrentState(root);
  const nextState: CurrentState = {
    ...state,
    metrics: {
      ...state.metrics,
      failed_attempts: state.metrics.failed_attempts + (result.status === "failed" ? 1 : 0),
      recovered_runs: state.metrics.recovered_runs + (action === "resume" && result.status === "success" ? 1 : 0),
    },
  };
  saveCurrentState(root, nextState);
}

function completeTaskAndRefreshArtifacts(root: string, unitId: string): void {
  const parsed = parseUnitId(unitId);
  if (parsed.kind !== "task" || !parsed.milestone_id || !parsed.slice_id) {
    throw new Error(`Task completion requires a task unit id, received ${unitId}.`);
  }

  transitionState(root, "complete_task", `Verified and reviewed ${unitId}.`, unitId, "next-action");
  writeTaskCompletionArtifacts(root, unitId);
  markQueueItemDone(root, unitId);

  const afterQueue = loadCurrentState(root);
  saveCurrentState(root, {
    ...afterQueue,
    last_verified_commit: afterQueue.git.head_commit,
    metrics: {
      ...afterQueue.metrics,
      completed_tasks: afterQueue.metrics.completed_tasks + 1,
    },
  });

  const queue = loadQueueState(root);
  const remainingSliceTasks = queue.items.some((item) =>
    item.unit_type === "task" &&
    item.unit_id !== unitId &&
    item.milestone_id === parsed.milestone_id &&
    item.slice_id === parsed.slice_id &&
    item.status !== "done",
  );

  if (!remainingSliceTasks) {
    transitionState(root, "complete_slice", `All tasks in ${parsed.milestone_id}/${parsed.slice_id} are complete.`, unitId, "next-action");
    refreshSliceSummary(root, unitId);
    generateSliceUat(root, `${parsed.milestone_id}/${parsed.slice_id}`);
    runMemoryAudit(root, `${parsed.milestone_id}/${parsed.slice_id}`, "slice_complete");
  }

  transitionState(root, "reassess", `Completion artifacts refreshed for ${unitId}.`, unitId, "next-action");
  if (!remainingSliceTasks) {
    try {
      runLearningCycle(root, `${parsed.milestone_id}/${parsed.slice_id}`);
    } catch (error) {
      recordLearningError(root, error instanceof Error ? error.message : String(error));
    }
  }
  transitionState(root, "plan", `Ready to continue after completing ${unitId}.`, unitId, "next-action");
}

function updateStateAfterResult(root: string, runId: string, decision: NextActionDecision, result: NormalizedResult): void {
  const unitId = decision.unit_id;
  if (!unitId) {
    return;
  }

  const planningUnit =
    decision.unit_type === "roadmap" ||
    decision.unit_type === "milestone" ||
    decision.role === "slice-planner" ||
    decision.role === "task-framer";

  if (planningUnit) {
    syncPlanningQueue(root);
  }

  if (result.status === "success") {
    if (planningUnit) {
      const validation = validatePlanningUnit(root, unitId);
      if (!validation.ok) {
        transitionState(
          root,
          "recover",
          `Run ${runId} reported planning success but left invalid artifacts for ${unitId}.`,
          unitId,
          "next-action",
        );
      } else {
        transitionState(root, "plan", `Run ${runId} completed planning for ${unitId}.`, unitId, "next-action");
      }
    } else if (decision.unit_type === "task") {
      transitionState(root, "verify", `Run ${runId} completed implementation for ${unitId}.`, unitId, "next-action");
    } else if (decision.unit_type === "verification") {
      const verificationState = getTaskVerificationState(root, unitId);
      if (!verificationState.verification) {
        transitionState(root, "recover", `Run ${runId} reported verification success without verification.json for ${unitId}.`, unitId, "next-action");
      } else if (verificationState.verification.verdict === "blocked") {
        transitionState(root, "blocked", `Verification for ${unitId} requires a blocker resolution.`, unitId, "next-action");
      } else if (verificationState.verification.verdict === "pass") {
        transitionState(root, "review", `Verification passed for ${unitId}.`, unitId, "next-action");
      } else {
        transitionState(root, "implement", `Verification requested implementation changes for ${unitId}.`, unitId, "next-action");
      }
    } else if (decision.unit_type === "review") {
      const verificationState = getTaskVerificationState(root, unitId);
      const matchingReview = decision.reviewer_pass
        ? verificationState.reviews
            .filter((review) => review.persona === decision.reviewer_pass)
            .at(-1) ?? null
        : null;

      if (!matchingReview) {
        transitionState(
          root,
          "recover",
          `Run ${runId} reported review success without ${decision.reviewer_pass ?? "review"} report for ${unitId}.`,
          unitId,
          "next-action",
        );
      } else if (matchingReview.verdict === "blocked") {
        transitionState(root, "blocked", `Review ${matchingReview.persona} blocked ${unitId}.`, unitId, "next-action");
      } else if (matchingReview.verdict === "changes_requested") {
        transitionState(root, "implement", `Review ${matchingReview.persona} requested changes for ${unitId}.`, unitId, "next-action");
      } else if (verificationState.pending_reviewers.length > 0) {
        transitionState(root, "review", `Continue reviewer passes for ${unitId}.`, unitId, "next-action");
      } else {
        completeTaskAndRefreshArtifacts(root, unitId);
      }
    } else {
      transitionState(root, "implement", `Run ${runId} completed and awaits verification.`, unitId, "next-action");
    }
  } else if (result.status === "blocked") {
    transitionState(root, "blocked", `Run ${runId} reported a blocker.`, unitId, "next-action");
  } else {
    transitionState(root, "recover", `Run ${runId} requires recovery after status ${result.status}.`, unitId, "next-action");
  }

  patchStateForRun(root, runId, decision.runtime!, unitId);
  updateMetrics(root, decision.action, result);

  if (decision.action === "resume" && result.status === "success") {
    runMemoryAudit(root, unitId, "recovery_resume");
  }

  if (result.status === "failed" && decision.unit_type) {
    const maxRetries = MAX_RETRIES_BY_UNIT_TYPE[decision.unit_type as UnitType] ?? 1;
    if (decision.retry_count + 1 >= maxRetries) {
      runPostmortem(root, runId, "retry_exhausted");
    }
  }
}

function nextFeedbackId(content: string, prefix: "B" | "Q", dateStamp: string): string {
  const regex = new RegExp(`## ${prefix}-${dateStamp}-(\\d{3})`, "g");
  let max = 0;
  for (const match of content.matchAll(regex)) {
    const value = Number.parseInt(match[1] ?? "0", 10);
    if (value > max) {
      max = value;
    }
  }

  return `${prefix}-${dateStamp}-${String(max + 1).padStart(3, "0")}`;
}

function appendBlocker(root: string, decision: NextActionDecision, runId: string, result: NormalizedResult | null): void {
  const ref = "vault/feedback/BLOCKERS.md";
  const path = resolveRepoPath(root, ref);
  const current = readTextIfExists(path) ?? "# Blockers\n";
  const dateStamp = new Date().toISOString().slice(0, 10);
  const blockerId = nextFeedbackId(current, "B", dateStamp);
  const cleaned = current.replace("- No active blockers.\n", "");
  const content = [
    cleaned.trimEnd(),
    "",
    `## ${blockerId}`,
    "",
    `- Scope: ${decision.unit_id ?? "unknown"}`,
    `- Type: ${result?.status === "blocked" ? "runtime_blocker" : "routing_escalation"}`,
    `- Blocker: ${(result?.blockers[0] ?? decision.rationale[0] ?? "Human intervention is required.").trim()}`,
    "- Required human action: Review the canonical run record and decide whether to unblock, replan, or answer through `vault/feedback/ANSWERS.md`.",
    "- Prepared artifacts:",
    `  - .supercodex/runs/${runId}/record.json`,
    `  - .supercodex/runs/${runId}/continue.md`,
    "- Resume condition: A human resolves the blocker or records a new decision in the feedback files.",
    "",
  ].join("\n");
  writeTextAtomic(path, `${content.trimEnd()}\n`);
}

function createRunningRecord(
  root: string,
  runId: string,
  decision: NextActionDecision,
  packet: DispatchPacket,
): CanonicalRunRecord {
  const state = loadCurrentState(root);
  const paths = getCanonicalRunPaths(runId);
  const record: CanonicalRunRecord = {
    version: 1,
    run_id: runId,
    parent_run_id: decision.action === "resume" ? decision.selected_run_id : null,
    unit_id: decision.unit_id!,
    unit_type: decision.unit_type!,
    action: decision.action as CanonicalRunRecord["action"],
    role: decision.role!,
    runtime: decision.runtime!,
    status: "running",
    summary: "Dispatch packet persisted; runtime execution has not completed yet.",
    decision_ref: paths.decision_ref,
    context_ref: paths.context_ref,
    packet_ref: paths.packet_ref,
    prompt_ref: paths.prompt_ref,
    handle_ref: null,
    normalized_ref: null,
    raw_ref: null,
    continuation_ref: paths.continuation_ref,
    state_ref: paths.state_ref,
    started_at: new Date().toISOString(),
    completed_at: null,
    retry_count: decision.retry_count,
    git_before: gitSnapshot(state),
    git_after: null,
    blockers: [],
    assumptions: [],
    verification_evidence: [],
    followups: [],
    reviewer_pass: decision.reviewer_pass,
    skills_used: [],
    usage: null,
  };
  saveCanonicalRunRecord(root, record);
  return record;
}

export async function dispatchNextAction(root: string): Promise<NextActionDispatchResult> {
  const preview = synthesizeNextAction(root);

  if (preview.decision.action === "escalate") {
    const runId = preview.decision.selected_run_id ?? `escalation-${Date.now()}`;
    appendBlocker(root, preview.decision, runId, null);
    if (preview.decision.unit_id) {
      transitionState(
        root,
        "awaiting_human",
        `Escalation is required for ${preview.decision.unit_id}.`,
        preview.decision.unit_id,
        "next-action",
      );
    }
    throw new Error(preview.decision.rationale[0] ?? "The next action requires escalation.");
  }

  if (preview.decision.action === "none" || !preview.packet || !preview.context_manifest || !preview.decision.runtime || !preview.decision.role) {
    throw new Error(preview.decision.rationale[0] ?? "No dispatchable next action is available.");
  }

  const runId = createRunId(preview.decision.runtime, preview.decision.unit_id!);
  const paths = getCanonicalRunPaths(runId);
  const prompt = preview.prompt_preview ?? buildPromptPreview(preview.decision, preview.packet);

  saveNextActionDecisionFile(root, runId, preview.decision);
  saveContextManifestFile(root, runId, preview.context_manifest);
  writeJsonFile(resolveRepoPath(root, paths.packet_ref), preview.packet);
  savePromptFile(root, runId, prompt);
  saveStateSnapshot(root, runId, loadCurrentState(root));
  saveContinuationArtifacts(root, runId, buildContinuationPacket(runId, preview.decision, preview.packet, null));
  writeRecoveryCheckpoint(
    root,
    runId,
    "pre_dispatch",
    `Prepared ${preview.decision.action} for ${preview.decision.unit_id}.`,
    preview.decision.unit_id,
    preview.decision.runtime,
  );

  const current = loadCurrentState(root);
  if (current.phase !== "dispatch") {
    transitionState(root, "dispatch", `Synthesized ${preview.decision.action} for ${preview.decision.unit_id}.`, preview.decision.unit_id!, "next-action");
  }
  patchStateForRun(root, runId, preview.decision.runtime, preview.decision.unit_id!);

  let record = createRunningRecord(root, runId, preview.decision, preview.packet);

  const adapter = getRuntimeAdapter(preview.decision.runtime);
  const dispatched =
    preview.decision.action === "resume" && preview.decision.selected_run_id
      ? await adapter.resume(root, preview.decision.selected_run_id, undefined, runId)
      : await adapter.dispatch(root, preview.packet, runId);

  writeJsonFile(resolveRepoPath(root, paths.handle_ref), dispatched.handle);
  writeJsonFile(resolveRepoPath(root, paths.normalized_ref), dispatched.result);
  saveContinuationArtifacts(root, runId, buildContinuationPacket(runId, preview.decision, preview.packet, dispatched.result));
  writeRecoveryCheckpoint(
    root,
    runId,
    "post_result",
    `Captured ${dispatched.result.status} result for ${preview.decision.unit_id}.`,
    preview.decision.unit_id,
    preview.decision.runtime,
  );

  record = {
    ...record,
    parent_run_id: dispatched.handle.parent_run_id,
    status: dispatched.result.status,
    summary: dispatched.result.summary,
    handle_ref: paths.handle_ref,
    normalized_ref: paths.normalized_ref,
    raw_ref: dispatched.result.raw_ref,
    completed_at: dispatched.result.completed_at,
    git_after: gitSnapshot(reconcileState(root)),
    blockers: [...dispatched.result.blockers],
    assumptions: [...dispatched.result.assumptions],
    verification_evidence: [...dispatched.result.verification_evidence],
    followups: [...dispatched.result.followups],
    reviewer_pass: preview.decision.reviewer_pass,
    skills_used: [...(dispatched.result.skills_used ?? [])],
    usage: dispatched.result.usage ?? null,
  };
  saveCanonicalRunRecord(root, record);
  updateStateAfterResult(root, runId, preview.decision, dispatched.result);

  if (dispatched.result.status === "blocked") {
    appendBlocker(root, preview.decision, runId, dispatched.result);
  }

  return {
    ...preview,
    prompt_preview: prompt,
    record,
    handle: dispatched.handle,
    result: dispatched.result,
  };
}

export function formatNextActionShow(result: NextActionShowResult): string {
  const lines = [
    `Action: ${result.decision.action}`,
    `Unit: ${result.decision.unit_id ?? "none"}`,
    `Runtime: ${result.decision.runtime ?? "none"}`,
    `Role: ${result.decision.role ?? "none"}`,
    ...(result.decision.reviewer_pass ? [`Reviewer: ${result.decision.reviewer_pass}`] : []),
    "",
    "Rationale:",
    ...result.decision.rationale.map((entry) => `- ${entry}`),
  ];

  if (result.packet) {
    lines.push("", `Objective: ${result.packet.objective}`, `Context refs: ${result.packet.context_refs.length}`);
  }

  return `${lines.join("\n")}\n`;
}
