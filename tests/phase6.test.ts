import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

function codexInterruptedThenResumeStub(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex 9.9.9");
  process.exit(0);
}

const outputIndex = args.indexOf("--output-last-message");
const outputPath = args[outputIndex + 1];
const resuming = args.includes("resume");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: resuming ? "success" : "interrupted",
    summary: resuming ? "resumed recovery run" : "runtime session paused",
    tests_written: [],
    tests_run: [],
    verification_evidence: [resuming ? "resume completed" : "checkpoint written"],
    assumptions: [],
    blockers: [],
    followups: resuming ? ["continue with deterministic follow-up"] : ["resume the interrupted session"]
  }) + "\\n",
  "utf8",
);
console.log(JSON.stringify({ event: resuming ? "session.resumed" : "session.started", session_id: "codex-session-recovery" }));
process.exit(0);
`;
}

function codexInterruptedWithoutSessionStub(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex 9.9.9");
  process.exit(0);
}

const outputIndex = args.indexOf("--output-last-message");
const outputPath = args[outputIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: "interrupted",
    summary: "runtime session paused without recoverable session id",
    tests_written: [],
    tests_run: [],
    verification_evidence: [],
    assumptions: [],
    blockers: [],
    followups: ["create a fresh attempt for the same unit"]
  }) + "\\n",
  "utf8",
);
process.exit(0);
`;
}

function codexFailStub(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("codex 9.9.9");
  process.exit(0);
}

const outputIndex = args.indexOf("--output-last-message");
const outputPath = args[outputIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: "failed",
    summary: "execution failed",
    tests_written: [],
    tests_run: ["pnpm test -- phase6"],
    verification_evidence: [],
    assumptions: [],
    blockers: [],
    followups: ["inspect the canonical run record"]
  }) + "\\n",
  "utf8",
);
process.exit(1);
`;
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
      summary: "implementation completed",
      tests_written: ["tests/phase6.test.ts"],
      tests_run: ["pnpm test -- phase6"],
      verification_evidence: ["implementation evidence recorded"],
      assumptions: [],
      blockers: [],
      followups: ["verify the implementation"],
    },
    `
fs.writeFileSync(path.join(process.cwd(), "phase6-impl.txt"), "implementation\\n", "utf8");
`,
  );
}

function verificationStub(verdict: "pass" | "fail" | "blocked"): string {
  return runtimeStub(
    {
      status: "success",
      summary: "verification completed",
      tests_written: [],
      tests_run: ["pnpm test -- phase6"],
      verification_evidence: ["verification report written"],
      assumptions: [],
      blockers: verdict === "blocked" ? ["verification blocked"] : [],
      followups: verdict === "pass" ? ["start reviewer passes"] : ["return to implementation"],
    },
    `
const runsDir = path.join(process.cwd(), ".supercodex/runs");
const implementationRunId = fs.readdirSync(runsDir)
  .map((name) => {
    const recordPath = path.join(runsDir, name, "record.json");
    if (!fs.existsSync(recordPath)) return null;
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    return record.unit_id === "M005/S01/T01" && record.role === "implementer" && record.status === "success" ? record.run_id : null;
  })
  .filter(Boolean)
  .sort()
  .at(-1);
const verificationRef = path.join(process.cwd(), ".supercodex/verify/M005/S01/T01/verification.json");
fs.mkdirSync(path.dirname(verificationRef), { recursive: true });
fs.writeFileSync(verificationRef, JSON.stringify({
  version: 1,
  unit_id: "M005/S01/T01",
  implementation_run_id: implementationRunId,
  verification_run_id: "verification-run",
  tdd_mode: "strict_tdd",
  tdd_justification: null,
  required_reviewers: ["correctness", "maintainability", "security"],
  ladder: {
    static: [],
    focused_tests: ["pnpm test -- phase6"],
    behavioral: [],
    slice_regression: [],
    milestone_regression: [],
    human_uat: []
  },
  tests_written: ["tests/phase6.test.ts"],
  tests_run: ["pnpm test -- phase6"],
  evidence: ["verification evidence"],
  summary: "verification ${verdict}",
  findings: ${verdict === "pass" ? "[]" : '["adjust the implementation"]'},
  followups: ${verdict === "pass" ? '["start reviews"]' : '["return to implementer"]'},
  verdict: "${verdict}",
  generated_at: "2026-03-19T12:30:00.000Z"
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
const reviewRef = path.join(process.cwd(), ".supercodex/verify/M005/S01/T01/reviews/${persona}.json");
fs.mkdirSync(path.dirname(reviewRef), { recursive: true });
fs.writeFileSync(reviewRef, JSON.stringify({
  version: 1,
  unit_id: "M005/S01/T01",
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

function taskMarkdown(): string {
  return [
    "# T01: Verify task completion deterministically",
    "",
    "## Objective",
    "",
    "Implement the bounded task and prove it through verifier and reviewer passes.",
    "",
    "## Why Now",
    "",
    "Phase 5 is not credible until successful task execution advances through verification and review without manual queue edits.",
    "",
    "## Acceptance Criteria",
    "",
    "- The task routes from implementation into verification and review automatically.",
    "- The control plane writes verification and completion artifacts to disk.",
    "- Slice UAT instructions are generated after the final task completes.",
    "",
    "## TDD Mode",
    "",
    "strict_tdd",
    "",
    "## Likely Files",
    "",
    "- `src/supercodex/synth/next-action.ts`",
    "- `src/supercodex/verify/index.ts`",
    "- `tests/phase6.test.ts`",
    "",
    "## Verification Plan",
    "",
    "- `pnpm test -- phase6`",
    "- Inspect `.supercodex/verify/M005/S01/T01/verification.json`",
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
    "planned",
    "",
    "## Summary",
    "",
    "Pending.",
    "",
  ].join("\n");
}

function seedPhaseFiveSurface(root: string): void {
  writeText(root, "vault/milestones/M005/milestone.md", "# M005: TDD and Verification Pipeline\n");
  writeText(root, "vault/milestones/M005/boundary-map.md", "# M005 Boundary Map\n");
  writeText(root, "vault/milestones/M005/summary.md", "# M005 Summary\n\nStatus: planned\n");
  writeText(root, "vault/milestones/M005/uat.md", "# M005 UAT\n");
  writeText(root, "vault/milestones/M005/slices/S01/slice.md", "# S01: Task Verification Pipeline\n\nDemo sentence: A task advances through implement, verify, review, and completion deterministically.\n");
  writeText(root, "vault/milestones/M005/slices/S01/boundary-map.md", "# S01 Boundary Map\n");
  writeText(root, "vault/milestones/M005/slices/S01/research.md", "# S01 Research\n");
  writeText(root, "vault/milestones/M005/slices/S01/plan.md", "# S01 Plan\n");
  writeText(root, "vault/milestones/M005/slices/S01/review.md", "# S01 Review\n");
  writeText(root, "vault/milestones/M005/slices/S01/summary.md", "# S01 Summary\n\nStatus: planned\n\nThis slice is waiting on task execution.\n");
  writeText(root, "vault/milestones/M005/slices/S01/tasks/T01.md", taskMarkdown());
  setActiveMilestone(root, "M005");
  clearQueue(root);
}

describe("Phase 6 recovery and audit layer", () => {
  test("interrupted runs write continuation artifacts, recover show prefers resume, and resume success increments recovery metrics", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    updateRuntimeCommand(root, "codex", writeExecutable(root, "bin/codex-recovery", codexInterruptedThenResumeStub()));

    const firstDispatch = await invokeCli(root, ["next-action", "dispatch"]);
    expect(firstDispatch.code).toBe(0);
    const firstPayload = JSON.parse(firstDispatch.stdout);
    expect(firstPayload.result).toMatchObject({
      status: "interrupted",
      summary: "runtime session paused",
    });

    expect(readJson(root, `.supercodex/runs/${firstPayload.handle.run_id}/continuation.json`)).toMatchObject({
      run_id: firstPayload.handle.run_id,
      status: "interrupted",
    });
    expect(readdirSync(join(root, `.supercodex/runs/${firstPayload.handle.run_id}/checkpoints`)).sort()).toEqual([
      "001-pre-dispatch.json",
      "002-post-result.json",
    ]);

    const assessment = JSON.parse((await invokeCli(root, ["recover", "show", "--run-id", firstPayload.handle.run_id])).stdout);
    expect(assessment).toMatchObject({
      recommendation: "resume",
      can_resume: true,
    });

    const reconcile = JSON.parse((await invokeCli(root, ["recover", "reconcile", "--run-id", firstPayload.handle.run_id])).stdout);
    expect(reconcile.assessment.recommendation).toBe("resume");
    expect(reconcile.reconciled_state.phase).toBe("recover");

    const show = JSON.parse((await invokeCli(root, ["next-action", "show", "--json"])).stdout);
    expect(show.decision).toMatchObject({
      action: "resume",
      selected_run_id: firstPayload.handle.run_id,
    });

    const resumed = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    expect(resumed.decision.action).toBe("resume");
    expect(resumed.result).toMatchObject({
      status: "success",
      summary: "resumed recovery run",
    });

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.recovered_runs).toBe(1);
    expect(readJson(root, ".supercodex/audits/memory/m002-s01.json")).toMatchObject({
      unit_id: "M002/S01",
      trigger: "recovery_resume",
    });
  });

  test("recover show and reconcile refuse resume when the interrupted run has no captured session id", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    updateRuntimeCommand(root, "codex", writeExecutable(root, "bin/codex-no-session", codexInterruptedWithoutSessionStub()));

    const firstDispatch = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    const assessment = JSON.parse((await invokeCli(root, ["recover", "show", "--run-id", firstDispatch.handle.run_id])).stdout);
    expect(assessment.recommendation).toBe("dispatch");
    expect(assessment.can_resume).toBe(false);
    expect(assessment.drifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_session_id",
          severity: "blocking",
        }),
      ]),
    );

    const reconcile = JSON.parse((await invokeCli(root, ["recover", "reconcile", "--run-id", firstDispatch.handle.run_id])).stdout);
    expect(reconcile.assessment.recommendation).toBe("dispatch");
    expect(reconcile.reconciled_state.phase).toBe("recover");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.recovery_mismatches).toBeGreaterThan(0);

    const show = JSON.parse((await invokeCli(root, ["next-action", "show", "--json"])).stdout);
    expect(show.decision.action).toBe("dispatch");
  });

  test("failed runs with exhausted retry budget generate a postmortem", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    updateRuntimeCommand(root, "codex", writeExecutable(root, "bin/codex-fail", codexFailStub()));

    const first = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    expect(first.result.status).toBe("failed");

    const show = JSON.parse((await invokeCli(root, ["next-action", "show", "--json"])).stdout);
    expect(show.decision.action).toBe("retry");

    const second = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);
    expect(second.result.status).toBe("failed");
    expect(readJson(root, `.supercodex/audits/postmortems/${second.handle.run_id}.json`)).toMatchObject({
      run_id: second.handle.run_id,
      trigger: "retry_exhausted",
      unit_id: "M002/S01",
    });

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.metrics.postmortems_generated).toBe(1);
  });

  test("memory audit fails when completed task summaries drift from completion truth", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    seedPhaseFiveSurface(root);
    await invokeCli(root, ["plan", "sync"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase6-impl", implementationStub()));
    await invokeCli(root, ["next-action", "dispatch"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase6-verify", verificationStub("pass")));
    await invokeCli(root, ["next-action", "dispatch"]);

    for (const reviewer of ["correctness", "maintainability", "security"]) {
      setAllRuntimeCommands(root, writeExecutable(root, `bin/review-${reviewer}`, reviewStub(reviewer)));
      await invokeCli(root, ["next-action", "dispatch"]);
    }

    const taskPath = "vault/milestones/M005/slices/S01/tasks/T01.md";
    writeText(root, taskPath, readText(root, taskPath).replace(/## Summary[\s\S]*$/, "## Summary\n\nPending.\n"));

    const audit = JSON.parse((await invokeCli(root, ["audit", "memory", "--unit", "M005/S01/T01"])).stdout);
    expect(audit).toMatchObject({
      unit_id: "M005/S01/T01",
      verdict: "fail",
    });
    expect(audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "task_summary_stale",
        }),
      ]),
    );
  }, 20000);

  test("doctor reports missing recovery continuation artifacts", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    updateRuntimeCommand(root, "codex", writeExecutable(root, "bin/codex-recovery", codexInterruptedThenResumeStub()));
    const dispatch = JSON.parse((await invokeCli(root, ["next-action", "dispatch"])).stdout);

    rmSync(join(root, `.supercodex/runs/${dispatch.handle.run_id}/continuation.json`));

    const doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain(`Recovery run ${dispatch.handle.run_id} is missing continuation.json.`);
  });
});
