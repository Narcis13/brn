import { rmSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import type { CurrentState, QueueState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, writeExecutable, writeJson } from "./helpers.js";

function setActiveMilestone(root: string, milestoneId: string): void {
  const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
  writeJson(root, ".supercodex/state/current.json", {
    ...current,
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

function updateRuntimeCommand(root: string, runtime: "claude" | "codex", command: string): void {
  const registry = readJson<RuntimeRegistry>(root, ".supercodex/runtime/adapters.json");
  registry.runtimes[runtime] = {
    ...registry.runtimes[runtime],
    command,
  };
  writeJson(root, ".supercodex/runtime/adapters.json", registry);
}

function preferCodexForSlices(root: string): void {
  const routing = readJson<{
    version: number;
    default_policy_ref: string;
    task_class_overrides: Record<string, { preferred_runtime?: "claude" | "codex"; preferred_role?: string }>;
  }>(root, ".supercodex/runtime/routing.json");

  routing.task_class_overrides.slice = {
    ...routing.task_class_overrides.slice,
    preferred_runtime: "codex",
  };

  writeJson(root, ".supercodex/runtime/routing.json", routing);
}

function planningCodexStub(): string {
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

const taskRoot = path.join(process.cwd(), "vault/milestones/M004/slices/S01/tasks");
fs.mkdirSync(taskRoot, { recursive: true });

const taskOne = [
  "# T01: Recreate planning task artifacts",
  "",
  "## Objective",
  "",
  "Rebuild the first planning task file from the slice planner run.",
  "",
  "## Why Now",
  "",
  "The slice cannot transition back to task execution until deterministic task files exist again.",
  "",
  "## Acceptance Criteria",
  "",
  "- Create a valid task file for M004/S01/T01.",
  "- Keep the task contract parseable from markdown sections.",
  "",
  "## TDD Mode",
  "",
  "brownfield_tdd",
  "",
  "## Likely Files",
  "",
  "- \`src/supercodex/planning/index.ts\`",
  "- \`tests/phase4.test.ts\`",
  "",
  "## Verification Plan",
  "",
  "- pnpm test",
  "- supercodex plan validate --unit M004/S01",
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
  ""
].join("\\n");

const taskTwo = [
  "# T02: Recreate dependent planning task",
  "",
  "## Objective",
  "",
  "Rebuild the dependent planning task so queue synchronization can restore the slice task chain.",
  "",
  "## Why Now",
  "",
  "A second task proves queue ordering and dependency parsing still work after planning runs.",
  "",
  "## Acceptance Criteria",
  "",
  "- Create a valid task file for M004/S01/T02.",
  "- Depend explicitly on M004/S01/T01.",
  "",
  "## TDD Mode",
  "",
  "brownfield_tdd",
  "",
  "## Likely Files",
  "",
  "- \`src/supercodex/planning/index.ts\`",
  "- \`tests/phase4.test.ts\`",
  "",
  "## Verification Plan",
  "",
  "- pnpm test",
  "- inspect .supercodex/state/queue.json",
  "",
  "## Dependencies",
  "",
  "- M004/S01/T01",
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
  ""
].join("\\n");

fs.writeFileSync(path.join(taskRoot, "T01.md"), taskOne, "utf8");
fs.writeFileSync(path.join(taskRoot, "T02.md"), taskTwo, "utf8");

fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: "success",
    summary: "slice planning completed",
    tests_written: ["tests/phase4.test.ts"],
    tests_run: ["pnpm test"],
    verification_evidence: ["planning queue synchronized"],
    assumptions: [],
    blockers: [],
    followups: ["continue with the first generated task"]
  }) + "\\n",
  "utf8",
);

console.log(JSON.stringify({ event: "session.started", session_id: "codex-phase4-planning" }));
process.exit(0);
`;
}

describe("Phase 4 planning and slice engine", () => {
  test("plan validate accepts the seeded modern slice contract", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const validate = await invokeCli(root, ["plan", "validate", "--unit", "M004/S01"]);
    expect(validate.code).toBe(0);

    const payload = JSON.parse(validate.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.validations[0]).toMatchObject({
      unit_id: "M004/S01",
      unit_type: "slice",
      mode: "modern",
      ok: true,
    });
    expect(payload.validations[0].tasks).toHaveLength(2);
  });

  test("plan sync turns valid modern slice tasks into ready queue items", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    setActiveMilestone(root, "M004");
    clearQueue(root);

    const sync = await invokeCli(root, ["plan", "sync"]);
    expect(sync.code).toBe(0);

    const payload = JSON.parse(sync.stdout);
    expect(payload.queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unit_id: "M004", unit_type: "milestone", status: "done" }),
        expect.objectContaining({ unit_id: "M004/S01", unit_type: "slice", status: "done" }),
        expect.objectContaining({
          unit_id: "M004/S01/T01",
          unit_type: "task",
          status: "ready",
          depends_on: [],
        }),
        expect.objectContaining({
          unit_id: "M004/S01/T02",
          unit_type: "task",
          status: "ready",
          depends_on: ["M004/S01/T01"],
        }),
      ]),
    );
    expect(payload.reconciled_state.queue_head).toBe("M004/S01/T01");
  });

  test("next-action show routes an unplanned modern slice to slice-planner", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    setActiveMilestone(root, "M004");
    clearQueue(root);
    rmSync(join(root, "vault/milestones/M004/slices/S01/tasks"), { recursive: true, force: true });

    const sync = await invokeCli(root, ["plan", "sync"]);
    expect(sync.code).toBe(0);

    const show = await invokeCli(root, ["next-action", "show", "--json"]);
    expect(show.code).toBe(0);

    const payload = JSON.parse(show.stdout);
    expect(payload.decision).toMatchObject({
      action: "dispatch",
      unit_id: "M004/S01",
      unit_type: "slice",
      role: "slice-planner",
      runtime: "claude",
    });
  });

  test("successful planning dispatch syncs tasks and returns the system to plan", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    setActiveMilestone(root, "M004");
    clearQueue(root);
    rmSync(join(root, "vault/milestones/M004/slices/S01/tasks"), { recursive: true, force: true });
    preferCodexForSlices(root);

    const codexPath = writeExecutable(root, "bin/codex-phase4-planning", planningCodexStub());
    updateRuntimeCommand(root, "codex", codexPath);

    const synced = await invokeCli(root, ["plan", "sync"]);
    expect(synced.code).toBe(0);

    const dispatch = await invokeCli(root, ["next-action", "dispatch"]);
    expect(dispatch.code).toBe(0);

    const payload = JSON.parse(dispatch.stdout);
    expect(payload.result).toMatchObject({
      runtime: "codex",
      status: "success",
      summary: "slice planning completed",
    });

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("plan");
    expect(current.queue_head).toBe("M004/S01/T01");
    expect(current.active_slice).toBe("S01");

    const queue = readJson<QueueState>(root, ".supercodex/state/queue.json");
    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unit_id: "M004/S01", status: "done" }),
        expect.objectContaining({ unit_id: "M004/S01/T01", status: "ready" }),
        expect.objectContaining({ unit_id: "M004/S01/T02", depends_on: ["M004/S01/T01"] }),
      ]),
    );
  });
});
