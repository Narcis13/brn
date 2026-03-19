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
      tests_written: ["tests/phase5.test.ts"],
      tests_run: ["pnpm test -- phase5"],
      verification_evidence: ["implementation evidence recorded"],
      assumptions: [],
      blockers: [],
      followups: ["verify the implementation"],
    },
    `
fs.writeFileSync(path.join(process.cwd(), "phase5-impl.txt"), "implementation\\n", "utf8");
`,
  );
}

function verificationStub(verdict: "pass" | "fail" | "blocked"): string {
  return runtimeStub(
    {
      status: "success",
      summary: "verification completed",
      tests_written: [],
      tests_run: ["pnpm test -- phase5"],
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
    focused_tests: ["pnpm test -- phase5"],
    behavioral: [],
    slice_regression: [],
    milestone_regression: [],
    human_uat: []
  },
  tests_written: ["tests/phase5.test.ts"],
  tests_run: ["pnpm test -- phase5"],
  evidence: ["verification evidence"],
  summary: "verification ${verdict}",
  findings: ${verdict === "pass" ? "[]" : '["adjust the implementation"]'},
  followups: ${verdict === "pass" ? '["start reviews"]' : '["return to implementer"]'},
  verdict: "${verdict}",
  generated_at: "2026-03-18T12:30:00.000Z"
}, null, 2) + "\\n", "utf8");
`,
  );
}

function reviewStub(persona: string, writeReport = true): string {
  const extraScript = writeReport
    ? `
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
  generated_at: "2026-03-18T12:40:00.000Z"
}, null, 2) + "\\n", "utf8");
`
    : "";

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
    extraScript,
  );
}

function taskMarkdown(options: {
  tddMode?: "strict_tdd" | "brownfield_tdd" | "verification_first";
  tddJustification?: string | null;
  includeReviewerPasses?: boolean;
} = {}): string {
  const tddMode = options.tddMode ?? "strict_tdd";
  const lines = [
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
    tddMode,
    "",
  ];

  if (options.tddJustification !== undefined) {
    lines.push("## TDD Justification", "", options.tddJustification ?? "", "");
  }

  lines.push(
    "## Likely Files",
    "",
    "- `src/supercodex/synth/next-action.ts`",
    "- `src/supercodex/verify/index.ts`",
    "- `tests/phase5.test.ts`",
    "",
    "## Verification Plan",
    "",
    "- `pnpm test -- phase5`",
    "- Inspect `.supercodex/verify/M005/S01/T01/verification.json`",
    "",
  );

  if (options.includeReviewerPasses) {
    lines.push("## Reviewer Passes", "", "- correctness", "- maintainability", "- security", "");
  }

  lines.push(
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
  );

  return lines.join("\n");
}

function seedPhaseFiveSurface(
  root: string,
  options: {
    tddMode?: "strict_tdd" | "brownfield_tdd" | "verification_first";
    tddJustification?: string | null;
    includeReviewerPasses?: boolean;
  } = {},
): void {
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
  writeText(root, "vault/milestones/M005/slices/S01/tasks/T01.md", taskMarkdown(options));

  setActiveMilestone(root, "M005");
  clearQueue(root);
}

describe("Phase 5 TDD and verification pipeline", () => {
  test("a strict TDD task completes through verification, three reviewer passes, and slice UAT generation", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    seedPhaseFiveSurface(root);

    const sync = await invokeCli(root, ["plan", "sync"]);
    expect(sync.code).toBe(0);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-impl", implementationStub()));

    const implement = await invokeCli(root, ["next-action", "dispatch"]);
    expect(implement.code).toBe(0);
    expect(JSON.parse(implement.stdout).decision).toMatchObject({
      unit_id: "M005/S01/T01",
      unit_type: "task",
      role: "implementer",
    });
    expect(readJson<CurrentState>(root, ".supercodex/state/current.json").phase).toBe("verify");

    const verifyStatusBefore = await invokeCli(root, ["verify", "show", "--unit", "M005/S01/T01", "--json"]);
    expect(JSON.parse(verifyStatusBefore.stdout)).toMatchObject({
      status: "verify",
      pending_reviewers: [],
    });

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-verify", verificationStub("pass")));

    const verify = await invokeCli(root, ["next-action", "dispatch"]);
    expect(verify.code).toBe(0);
    expect(JSON.parse(verify.stdout).decision).toMatchObject({
      unit_type: "verification",
      role: "verifier",
    });
    expect(readJson<CurrentState>(root, ".supercodex/state/current.json").phase).toBe("review");

    const verifyStatusAfter = await invokeCli(root, ["verify", "show", "--unit", "M005/S01/T01", "--json"]);
    expect(JSON.parse(verifyStatusAfter.stdout)).toMatchObject({
      status: "review",
      pending_reviewers: ["correctness", "maintainability", "security"],
      next_reviewer: "correctness",
    });

    for (const reviewer of ["correctness", "maintainability", "security"]) {
      setAllRuntimeCommands(root, writeExecutable(root, `bin/review-${reviewer}`, reviewStub(reviewer)));
      const review = await invokeCli(root, ["next-action", "dispatch"]);
      expect(review.code).toBe(0);
      expect(JSON.parse(review.stdout).decision).toMatchObject({
        unit_type: "review",
        role: "reviewers",
        reviewer_pass: reviewer,
      });
    }

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("plan");
    expect(current.metrics.completed_tasks).toBe(1);

    const queue = readJson<QueueState>(root, ".supercodex/state/queue.json");
    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit_id: "M005/S01/T01",
          status: "done",
        }),
      ]),
    );

    const verificationState = await invokeCli(root, ["verify", "show", "--unit", "M005/S01/T01", "--json"]);
    expect(JSON.parse(verificationState.stdout)).toMatchObject({
      status: "complete",
      pending_reviewers: [],
      completion: expect.objectContaining({
        unit_id: "M005/S01/T01",
      }),
    });

    expect(readText(root, "vault/milestones/M005/slices/S01/tasks/T01.md")).toContain("completed");
    expect(readText(root, "vault/milestones/M005/slices/S01/summary.md")).toContain("Status: complete");
    expect(readText(root, "vault/milestones/M005/uat.md")).toContain("## M005/S01");

    const uat = await invokeCli(root, ["uat", "generate", "--unit", "M005/S01"]);
    expect(uat.code).toBe(0);
    expect(JSON.parse(uat.stdout)).toMatchObject({
      unit_id: "M005/S01",
      ref: "vault/milestones/M005/uat.md",
    });
  }, 15000);

  test("a failing verifier report routes the task back to implement", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    seedPhaseFiveSurface(root);
    await invokeCli(root, ["plan", "sync"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-impl", implementationStub()));
    await invokeCli(root, ["next-action", "dispatch"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-verify-fail", verificationStub("fail")));
    const verify = await invokeCli(root, ["next-action", "dispatch"]);
    expect(verify.code).toBe(0);

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("implement");

    const show = await invokeCli(root, ["next-action", "show", "--json"]);
    expect(JSON.parse(show.stdout).decision).toMatchObject({
      unit_id: "M005/S01/T01",
      unit_type: "task",
      role: "implementer",
    });
  });

  test("M005 task validation rejects brownfield TDD without a justification", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    seedPhaseFiveSurface(root, { tddMode: "brownfield_tdd" });

    const validate = await invokeCli(root, ["plan", "validate", "--unit", "M005/S01/T01"]);
    expect(validate.code).toBe(1);
    expect(validate.stdout).toContain("must explain why brownfield_tdd is required");
  });

  test("review success without a matching report forces recovery instead of silent completion", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);
    seedPhaseFiveSurface(root);
    await invokeCli(root, ["plan", "sync"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-impl", implementationStub()));
    await invokeCli(root, ["next-action", "dispatch"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/phase5-verify-pass", verificationStub("pass")));
    await invokeCli(root, ["next-action", "dispatch"]);

    setAllRuntimeCommands(root, writeExecutable(root, "bin/review-missing", reviewStub("correctness", false)));
    const review = await invokeCli(root, ["next-action", "dispatch"]);
    expect(review.code).toBe(0);

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("recover");
  });
});
