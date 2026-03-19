import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import type { CurrentState, QueueState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson, writeText } from "./helpers.js";

function updateRuntimeCommand(root: string, runtime: "claude" | "codex", command: string): void {
  const registry = readJson<RuntimeRegistry>(root, ".supercodex/runtime/adapters.json");
  registry.runtimes[runtime] = {
    ...registry.runtimes[runtime],
    command,
  };
  writeJson(root, ".supercodex/runtime/adapters.json", registry);
}

function setAllRuntimeCommands(root: string, command: string): void {
  updateRuntimeCommand(root, "codex", command);
  updateRuntimeCommand(root, "claude", command);
}

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

function runtimeStub(modelResponse: Record<string, unknown>, extraScript = ""): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("stub 9.9.9");
  process.exit(0);
}

${extraScript}

const payload = ${JSON.stringify(modelResponse)};
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex !== -1) {
  const outputPath = args[outputIndex + 1];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload) + "\\n", "utf8");
  console.log(JSON.stringify({ event: "session.started", session_id: "phase8-session" }));
  process.exit(payload.status === "failed" ? 1 : 0);
}

console.log(JSON.stringify(payload));
process.exit(payload.status === "failed" ? 1 : 0);
`;
}

function implementationStub(): string {
  return runtimeStub(
    {
      status: "success",
      summary: "phase 8 implementation completed",
      tests_written: ["tests/phase8.test.ts"],
      tests_run: [],
      verification_evidence: ["implementation evidence recorded"],
      assumptions: [],
      blockers: [],
      followups: ["run verification"],
      skills_used: [{ skill_id: "test-skill", outcome: "helpful", note: "Used for bounded implementation flow." }],
      usage: { input_tokens: 30, output_tokens: 12, total_tokens: 42 },
    },
    `
fs.writeFileSync(path.join(process.cwd(), "phase8-impl.txt"), "implementation\\n", "utf8");
`,
  );
}

function verificationStub(unitId: string): string {
  return runtimeStub(
    {
      status: "success",
      summary: "phase 8 verification completed",
      tests_written: [],
      tests_run: ["pnpm test -- phase8"],
      verification_evidence: ["verification report written"],
      assumptions: [],
      blockers: [],
      followups: ["start reviewer passes"],
    },
    `
const runsDir = path.join(process.cwd(), ".supercodex/runs");
const implementationRunId = fs.readdirSync(runsDir)
  .map((name) => {
    const recordPath = path.join(runsDir, name, "record.json");
    if (!fs.existsSync(recordPath)) return null;
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    return record.unit_id === "${unitId}" && record.role === "implementer" && record.status === "success" ? record.run_id : null;
  })
  .filter(Boolean)
  .sort()
  .at(-1);
const verificationRef = path.join(process.cwd(), ".supercodex/verify/${unitId.replaceAll("/", "/")}/verification.json");
fs.mkdirSync(path.dirname(verificationRef), { recursive: true });
fs.writeFileSync(verificationRef, JSON.stringify({
  version: 1,
  unit_id: "${unitId}",
  implementation_run_id: implementationRunId,
  verification_run_id: "verification-run",
  tdd_mode: "strict_tdd",
  tdd_justification: null,
  required_reviewers: ["correctness", "maintainability", "security"],
  ladder: {
    static: [],
    focused_tests: ["pnpm test -- phase8"],
    behavioral: [],
    slice_regression: [],
    milestone_regression: [],
    human_uat: []
  },
  tests_written: ["tests/phase8.test.ts"],
  tests_run: ["pnpm test -- phase8"],
  evidence: ["verification evidence"],
  summary: "verification pass",
  findings: [],
  followups: ["start reviews"],
  verdict: "pass",
  generated_at: "2026-03-19T12:30:00.000Z"
}, null, 2) + "\\n", "utf8");
`,
  );
}

function reviewStub(persona: string, unitId: string): string {
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
const reviewRef = path.join(process.cwd(), ".supercodex/verify/${unitId.replaceAll("/", "/")}/reviews/${persona}.json");
fs.mkdirSync(path.dirname(reviewRef), { recursive: true });
fs.writeFileSync(reviewRef, JSON.stringify({
  version: 1,
  unit_id: "${unitId}",
  persona: "${persona}",
  verification_run_id: "verification-run",
  review_run_id: "review-${persona}",
  summary: "${persona} review green",
  findings: [],
  followups: [],
  verdict: "green",
  generated_at: "2026-03-19T12:40:00.000Z"
}, null, 2) + "\\n", "utf8");
`,
  );
}

function failureStub(): string {
  return runtimeStub({
    status: "failed",
    summary: "phase 8 execution failed",
    tests_written: [],
    tests_run: ["pnpm test -- phase8"],
    verification_evidence: [],
    assumptions: [],
    blockers: ["failing runtime"],
    followups: ["inspect the canonical run record"],
    usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
  });
}

function taskMarkdown(unitId: string): string {
  return [
    `# ${unitId.split("/").at(-1)}: Compound learning task`,
    "",
    "## Objective",
    "",
    "Complete the bounded task and prove that Phase 8 learning artifacts are emitted deterministically.",
    "",
    "## Why Now",
    "",
    "Phase 8 is not credible until completed work leaves behind recommendation-only learning artifacts.",
    "",
    "## Acceptance Criteria",
    "",
    "- The task completes through implementation, verification, and review.",
    "- Slice completion triggers learning artifacts without mutating roadmap or skills.",
    "- The task remains fully verifiable from disk.",
    "",
    "## TDD Mode",
    "",
    "strict_tdd",
    "",
    "## Likely Files",
    "",
    "- `src/supercodex/learning/index.ts`",
    "- `src/supercodex/synth/next-action.ts`",
    "- `tests/phase8.test.ts`",
    "",
    "## Verification Plan",
    "",
    "- `pnpm test -- phase8`",
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
    "Pending.",
    "",
  ].join("\n");
}

async function seedPhaseEightTask(root: string, unitId: string): Promise<void> {
  const [milestoneId, sliceId, taskId] = unitId.split("/");
  writeText(root, "skills/test-skill/SKILL.md", "# Test Skill\n\n- Trigger: bounded implementation work\n");
  writeText(root, `vault/milestones/${milestoneId}/slices/${sliceId}/summary.md`, `# ${sliceId} Summary\n\nStatus: planned\n\nAwaiting task completion.\n`);
  writeText(root, `vault/milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}.md`, taskMarkdown(unitId));
  setActiveMilestone(root, milestoneId);
  clearQueue(root);
  writeJson(root, ".supercodex/state/queue.json", {
    version: 1,
    items: [
      {
        unit_id: unitId,
        unit_type: "task",
        status: "ready",
        depends_on: [],
        enqueued_at: "2026-03-19T09:00:00.000Z",
        milestone_id: milestoneId,
        slice_id: sliceId,
        task_id: taskId,
      },
    ],
  } satisfies QueueState);
  await invokeCli(root, ["state", "reconcile"]);
}

async function completeLearningSlice(root: string, unitId: string): Promise<string[]> {
  const runIds: string[] = [];

  setAllRuntimeCommands(root, writeExecutable(root, "bin/phase8-implement", implementationStub()));
  let payload = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
  runIds.push(payload.record.run_id);

  setAllRuntimeCommands(root, writeExecutable(root, "bin/phase8-verify", verificationStub(unitId)));
  payload = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
  runIds.push(payload.record.run_id);

  for (const persona of ["correctness", "maintainability", "security"]) {
    setAllRuntimeCommands(root, writeExecutable(root, `bin/phase8-review-${persona}`, reviewStub(persona, unitId)));
    payload = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    runIds.push(payload.record.run_id);
  }

  return runIds;
}

describe("Phase 8 compound learning", () => {
  test("slice completion emits skill telemetry, roadmap reassessment, and deterministic pattern candidates", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    await seedPhaseEightTask(root, "M008/S01/T01");

    const roadmapBefore = readText(root, "vault/roadmap.md");
    await completeLearningSlice(root, "M008/S01/T01");

    const learning = readJson<{
      processed_slice_unit_ids: string[];
    }>(root, ".supercodex/state/learning.json");
    expect(learning.processed_slice_unit_ids).toContain("M008/S01");

    const show = JSON.parse((await invokeCli(root, ["learning", "show"])).stdout);
    expect(show.skill_health.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill_id: "test-skill",
          usage_count: 1,
          average_total_tokens: 42,
        }),
      ]),
    );
    expect(show.latest_roadmap_report).toMatchObject({
      unit_id: "M008/S01",
    });
    expect(show.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_unit_id: "M008/S01/T01",
        }),
      ]),
    );

    const rerun = JSON.parse((await invokeCli(root, ["learning", "run", "--unit", "M008/S01"])).stdout);
    expect(rerun.pattern_candidates).toHaveLength(1);
    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.learning_cycles).toBe(1);
    expect(current.metrics.pattern_candidates_generated).toBe(1);
    expect(current.metrics.roadmap_reassessments).toBe(1);
    expect(readText(root, "vault/roadmap.md")).toBe(roadmapBefore);
  }, 15000);

  test("manual postmortem generation also emits a process improvement report", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    await seedPhaseEightTask(root, "M008/S04/T01");

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase8-fail", failureStub()));
    const dispatch = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    const runId = dispatch.record.run_id as string;

    const postmortem = JSON.parse((await invokeCli(root, ["audit", "postmortem", "--run-id", runId])).stdout);
    expect(postmortem.run_id).toBe(runId);

    const process = readJson<{
      run_id: string;
      trigger: string;
      recommendations: Array<{ category: string }>;
    }>(root, `.supercodex/learning/process/${runId}.json`);
    expect(process).toMatchObject({
      run_id: runId,
      trigger: "postmortem",
    });
    expect(process.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "docs" }),
        expect.objectContaining({ category: "policies" }),
        expect.objectContaining({ category: "tests_checks" }),
      ]),
    );

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.process_reports_generated).toBe(1);
  });

  test("doctor reports unknown project skill ids recorded in canonical runs", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    await seedPhaseEightTask(root, "M008/S01/T01");
    const runIds = await completeLearningSlice(root, "M008/S01/T01");

    const record = readJson<{ skills_used?: Array<{ skill_id: string; outcome: string }> }>(
      root,
      `.supercodex/runs/${runIds[0]}/record.json`,
    );
    record.skills_used = [{ skill_id: "unknown-skill", outcome: "failed" }];
    writeJson(root, `.supercodex/runs/${runIds[0]}/record.json`, record);

    const doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain("unknown project skill id");
  }, 15000);
});
