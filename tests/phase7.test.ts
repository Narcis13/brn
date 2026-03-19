import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import type { CurrentState, QueueState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson, writeText } from "./helpers.js";

function setActiveMilestone(root: string, milestoneId: string): void {
  const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
  writeJson(root, ".supercodex/state/current.json", {
    ...current,
    phase: "plan",
    active_milestone: milestoneId,
    active_slice: null,
    active_task: null,
    queue_head: null,
  });
}

function clearQueue(root: string): void {
  writeJson(root, ".supercodex/state/queue.json", {
    version: 1,
    items: [],
  } satisfies QueueState);
}

function setAllRuntimeCommands(root: string, command: string): void {
  const registry = readJson<RuntimeRegistry>(root, ".supercodex/runtime/adapters.json");
  registry.runtimes.codex = {
    ...registry.runtimes.codex,
    command,
  };
  registry.runtimes.claude = {
    ...registry.runtimes.claude,
    command,
  };
  writeJson(root, ".supercodex/runtime/adapters.json", registry);
}

function runtimeStub(modelResponse: Record<string, unknown>, extraScript = ""): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("stub 9.9.9");
  process.exit(0);
}

const prompt = args.at(-1) || "";
const unitId = /"unit_id"\\s*:\\s*"([^"]+)"/.exec(prompt)?.[1] || "M007/S01/T01";
const controlRoot = /"control_root"\\s*:\\s*"([^"]+)"/.exec(prompt)?.[1] || process.cwd();
const parts = unitId.split("/");
const milestoneId = parts[0];
const sliceId = parts[1];
const taskId = parts[2];

${extraScript}

const payload = ${JSON.stringify(modelResponse)};
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex !== -1) {
  const outputPath = args[outputIndex + 1];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload) + "\\n", "utf8");
  console.log(JSON.stringify({ event: "session.started", session_id: "stub-session" }));
  process.exit(0);
}

console.log(JSON.stringify(payload));
process.exit(0);
`;
}

function implementationStub(): string {
  return runtimeStub(
    {
      status: "success",
      summary: "parallel implementation completed",
      tests_written: ["tests/phase7.test.ts"],
      tests_run: [],
      verification_evidence: ["implementation written in worktree"],
      assumptions: [],
      blockers: [],
      followups: ["verify the implementation"],
    },
    `
const fileMap = {
  T01: "src/task-t01.ts",
  T02: "src/task-t02.ts",
  T03: "src/task-t01.ts"
};
const relative = fileMap[taskId] || "src/task-generic.ts";
const target = path.join(process.cwd(), relative);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, "export const value = " + JSON.stringify(taskId) + "\\n", "utf8");
`,
  );
}

function verificationStub(): string {
  return runtimeStub(
    {
      status: "success",
      summary: "parallel verification completed",
      tests_written: [],
      tests_run: [],
      verification_evidence: ["verification report written"],
      assumptions: [],
      blockers: [],
      followups: ["start reviewer passes"],
    },
    `
const runsDir = path.join(controlRoot, ".supercodex", "runs");
const implementationRunId = fs.readdirSync(runsDir)
  .map((name) => {
    const recordPath = path.join(runsDir, name, "record.json");
    if (!fs.existsSync(recordPath)) return null;
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    return record.unit_id === unitId && record.role === "implementer" && record.status === "success" ? record.run_id : null;
  })
  .filter(Boolean)
  .sort()
  .at(-1);
const fileMap = {
  T01: "src/task-t01.ts",
  T02: "src/task-t02.ts",
  T03: "src/task-t01.ts"
};
const regressionCommand = "node -e \\"require('node:fs').accessSync('" + fileMap[taskId] + "')\\" # slice";
const verificationRef = path.join(process.cwd(), ".supercodex", "verify", milestoneId, sliceId, taskId, "verification.json");
fs.mkdirSync(path.dirname(verificationRef), { recursive: true });
fs.writeFileSync(verificationRef, JSON.stringify({
  version: 1,
  unit_id: unitId,
  implementation_run_id: implementationRunId,
  verification_run_id: "verification-" + taskId,
  tdd_mode: "strict_tdd",
  tdd_justification: null,
  required_reviewers: ["correctness", "maintainability", "security"],
  ladder: {
    static: [],
    focused_tests: [regressionCommand],
    behavioral: [],
    slice_regression: [regressionCommand],
    milestone_regression: [],
    human_uat: []
  },
  tests_written: ["tests/phase7.test.ts"],
  tests_run: [regressionCommand],
  evidence: ["verification evidence"],
  summary: "verification pass for " + unitId,
  findings: [],
  followups: ["start reviews"],
  verdict: "pass",
  generated_at: "2026-03-19T09:00:00.000Z"
}, null, 2) + "\\n", "utf8");
`,
  );
}

function reviewStub(persona: string): string {
  return runtimeStub(
    {
      status: "success",
      summary: `${persona} review completed`,
      tests_written: [],
      tests_run: [],
      verification_evidence: [`${persona} review completed`],
      assumptions: [],
      blockers: [],
      followups: [],
    },
    `
const verificationRef = path.join(process.cwd(), ".supercodex", "verify", milestoneId, sliceId, taskId, "verification.json");
const verification = JSON.parse(fs.readFileSync(verificationRef, "utf8"));
const reviewRef = path.join(process.cwd(), ".supercodex", "verify", milestoneId, sliceId, taskId, "reviews", "${persona}.json");
fs.mkdirSync(path.dirname(reviewRef), { recursive: true });
fs.writeFileSync(reviewRef, JSON.stringify({
  version: 1,
  unit_id: unitId,
  persona: "${persona}",
  verification_run_id: verification.verification_run_id,
  review_run_id: "${persona}-" + taskId,
  summary: "${persona} review green",
  findings: [],
  followups: [],
  verdict: "green",
  generated_at: "2026-03-19T09:10:00.000Z"
}, null, 2) + "\\n", "utf8");
`,
  );
}

function integrationStub(): string {
  return runtimeStub({
    status: "success",
    summary: "integration review passed",
    tests_written: [],
    tests_run: [],
    verification_evidence: ["integration review complete"],
    assumptions: [],
    blockers: [],
    followups: [],
  });
}

function taskMarkdown(title: string, likelyFile: string, verificationCommand: string): string {
  return [
    `# ${title}`,
    "",
    "## Objective",
    "",
    `Implement ${title} and move it through parallel verification and integration.`,
    "",
    "## Why Now",
    "",
    "Phase 7 is not real until independent tasks can run concurrently and converge safely.",
    "",
    "## Acceptance Criteria",
    "",
    "- The task is runnable inside an isolated worktree.",
    "- The task produces verification and review artifacts before integration.",
    "- The task can be integrated serially after review passes.",
    "",
    "## TDD Mode",
    "",
    "strict_tdd",
    "",
    "## Likely Files",
    "",
    `- \`${likelyFile}\``,
    "",
    "## Verification Plan",
    "",
    `- \`${verificationCommand}\``,
    "",
    "## Reviewer Passes",
    "",
    "- correctness",
    "- maintainability",
    "- security",
    "",
    "## Dependencies",
    "",
    "- none",
    "",
    "## Safety Class",
    "",
    "reversible",
    "",
    "## Status",
    "",
    "ready",
    "",
    "## Summary",
    "",
    "planned",
    "",
  ].join("\n");
}

function writePhase7Milestone(root: string): void {
  writeText(
    root,
    "vault/milestones/M007/milestone.md",
    [
      "# M007: Parallelism and Integration",
      "",
      "## Objective",
      "",
      "Add safe multi-worker task execution with serialized integration and semantic conflict checks.",
      "",
      "## Why Now",
      "",
      "The control plane already supports planning, verification, and recovery, but it still runs one task at a time.",
      "",
      "## Exit Criteria",
      "",
      "- Disjoint tasks can be scheduled concurrently.",
      "- Verified tasks wait in an integration queue until serialized convergence succeeds.",
      "- Integration blocks stale-base and regression failures deterministically.",
      "",
    ].join("\n"),
  );
  writeText(root, "vault/milestones/M007/boundary-map.md", "# M007 Boundary Map\n\n- Parallel workers own disjoint files.\n");
  writeText(root, "vault/milestones/M007/summary.md", "# M007 Summary\n\nStatus: planned\n");
  writeText(root, "vault/milestones/M007/uat.md", "# M007 UAT\n\nUAT steps for completed Phase 7 slices will be written here.\n");
  writeText(root, "vault/milestones/M007/slices/S01/slice.md", "# S01: Parallel Task Scheduling\n\nDemo sentence: independent tasks can run concurrently and converge safely.\n");
  writeText(root, "vault/milestones/M007/slices/S01/boundary-map.md", "# S01 Boundary Map\n\n- T01 owns task-t01.ts.\n- T02 owns task-t02.ts.\n- T03 conflicts with T01 on task-t01.ts.\n");
  writeText(root, "vault/milestones/M007/slices/S01/research.md", "# S01 Research\n\n- Require likely-files isolation and declared regression commands.\n");
  writeText(root, "vault/milestones/M007/slices/S01/plan.md", "# S01 Plan\n\n- Run T01 and T02 in parallel.\n- Keep T03 serial-only because it overlaps T01.\n");
  writeText(root, "vault/milestones/M007/slices/S01/review.md", "# S01 Review\n\n- Check worktree isolation and integration queue semantics.\n");
  writeText(root, "vault/milestones/M007/slices/S01/summary.md", "# S01 Summary\n\nStatus: planned\n");
  writeText(
    root,
    "vault/milestones/M007/slices/S01/tasks/T01.md",
    taskMarkdown("T01: Parallel worker one", "src/task-t01.ts", "node -e \"require('node:fs').accessSync('src/task-t01.ts')\" # slice"),
  );
  writeText(
    root,
    "vault/milestones/M007/slices/S01/tasks/T02.md",
    taskMarkdown("T02: Parallel worker two", "src/task-t02.ts", "node -e \"require('node:fs').accessSync('src/task-t02.ts')\" # slice"),
  );
  writeText(
    root,
    "vault/milestones/M007/slices/S01/tasks/T03.md",
    taskMarkdown("T03: Overlapping worker", "src/task-t01.ts", "node -e \"require('node:fs').accessSync('src/task-t01.ts')\" # slice"),
  );
}

async function preparePhase7Repo(root: string): Promise<void> {
  await invokeCli(root, ["init"]);
  writeText(root, "vault/vision.md", "# Vision\n\nBuild a deterministic multi-worker orchestration layer.\n");
  writePhase7Milestone(root);
  setActiveMilestone(root, "M007");
  clearQueue(root);
  const sync = await invokeCli(root, ["plan", "sync"]);
  expect(sync.code).toBe(0);
}

async function progressWorkersToReady(root: string, workerCount = 2): Promise<void> {
  setAllRuntimeCommands(root, writeExecutable(root, "bin/phase7-impl", implementationStub()));
  let result = await invokeCli(root, ["parallel", "dispatch", "--workers", String(workerCount)]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  setAllRuntimeCommands(root, writeExecutable(root, "bin/phase7-verify", verificationStub()));
  result = await invokeCli(root, ["parallel", "dispatch", "--workers", String(workerCount)]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout);
  }

  for (const persona of ["correctness", "maintainability", "security"]) {
    setAllRuntimeCommands(root, writeExecutable(root, `bin/phase7-review-${persona}`, reviewStub(persona)));
    result = await invokeCli(root, ["parallel", "dispatch", "--workers", String(workerCount)]);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }
}

describe("Phase 7 parallelism and integration", () => {
  test("parallel show selects only disjoint ready tasks", async () => {
    const root = createTempGitRepo();
    await preparePhase7Repo(root);

    const show = await invokeCli(root, ["parallel", "show"]);
    expect(show.code).toBe(0);
    const payload = JSON.parse(show.stdout);
    expect(payload.eligible_units).toEqual(["M007/S01/T01", "M007/S01/T02"]);
  });

  test("parallel workers progress to ready_to_integrate and serialized integration marks tasks done", async () => {
    const root = createTempGitRepo();
    await preparePhase7Repo(root);
    await progressWorkersToReady(root, 2);

    const parallel = JSON.parse((await invokeCli(root, ["parallel", "show"])).stdout);
    expect(parallel.workers).toHaveLength(2);
    expect(parallel.workers.every((worker: { status: string; canonical_commit: string | null }) => worker.status === "ready_to_integrate" && !!worker.canonical_commit)).toBe(true);

    const integrateShow = JSON.parse((await invokeCli(root, ["integrate", "show"])).stdout);
    expect(integrateShow.integration_state.queue.map((entry: { unit_id: string }) => entry.unit_id)).toEqual([
      "M007/S01/T01",
      "M007/S01/T02",
    ]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase7-integrate", integrationStub()));
    const integrated = JSON.parse((await invokeCli(root, ["integrate", "run", "--unit", "M007/S01/T01"])).stdout);
    expect(integrated.status).toBe("integrated");

    const queue = readJson<QueueState>(root, ".supercodex/state/queue.json");
    expect(queue.items.find((item) => item.unit_id === "M007/S01/T01")?.status).toBe("done");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.integrated_tasks).toBe(1);

    const report = readJson(root, integrated.report_ref);
    expect(report).toMatchObject({
      unit_id: "M007/S01/T01",
      verdict: "integrated",
    });

    const after = JSON.parse((await invokeCli(root, ["parallel", "show"])).stdout);
    expect(after.workers).toHaveLength(1);
    const integratedWorker = parallel.workers.find((worker: { unit_id: string }) => worker.unit_id === "M007/S01/T01");
    if (!integratedWorker) {
      throw new Error("Integrated worker was not found in the pre-integration snapshot.");
    }
    expect(existsSync(integratedWorker.worktree_path)).toBe(false);
  }, 15000);

  test("integration blocks when milestone head advances beyond the worker base commit", async () => {
    const root = createTempGitRepo();
    await preparePhase7Repo(root);
    await progressWorkersToReady(root, 1);

    const parallel = JSON.parse((await invokeCli(root, ["parallel", "show"])).stdout);
    const milestoneWorktree = parallel.parallel_state.milestone_worktree_path;
    expect(typeof milestoneWorktree).toBe("string");

    writeText(milestoneWorktree, "stale.txt", "advance milestone\n");
    execFileSync("git", ["add", "stale.txt"], { cwd: milestoneWorktree, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "advance milestone"], { cwd: milestoneWorktree, stdio: "pipe" });

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase7-integrate-blocked", integrationStub()));
    const blocked = JSON.parse((await invokeCli(root, ["integrate", "run", "--unit", "M007/S01/T01"])).stdout);
    expect(blocked.status).toBe("blocked");

    const report = readJson(root, blocked.report_ref);
    expect(report.semantic_conflicts.join("\n")).toContain("advanced");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.integration_conflicts).toBe(1);
  }, 15000);
});
