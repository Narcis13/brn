import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson, writeText } from "./helpers.js";

function codexToyStub(): string {
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
fs.mkdirSync(path.join(process.cwd(), "src"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "src", "toy.ts"), "export const greeting = 'hello from toy';\\n", "utf8");
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: "success",
    summary: "toy task completed",
    tests_written: ["tests/toy.test.ts"],
    tests_run: ["pnpm test"],
    verification_evidence: ["toy flow dispatched end to end"],
    assumptions: ["the toy project can use a single source file for the first dispatch"],
    blockers: [],
    followups: ["move to verification when real tests exist"]
  }) + "\\n",
  "utf8",
);
console.log(JSON.stringify({ event: "session.started", session_id: "codex-playground-toy" }));
process.exit(0);
`;
}

function updateRuntimeCommand(root: string, runtime: "claude" | "codex", command: string): void {
  const registry = readJson<RuntimeRegistry>(root, ".supercodex/runtime/adapters.json");
  registry.runtimes[runtime] = {
    ...registry.runtimes[runtime],
    command,
  };
  writeJson(root, ".supercodex/runtime/adapters.json", registry);
}

describe("toy playground flow", () => {
  test("a toy project can be scaffolded, synced, dispatched, and checked end to end", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    writeText(
      root,
      "vault/vision.md",
      `# Vision

## Project

Build a tiny toy project that proves SUPER_CODEX can move from intent to dispatchable tasks without hand-written milestone trees.

## Why It Matters

- A toy flow should exercise deterministic planning artifact generation.
- The operator path should stay file-backed and reproducible.

## Success Signals

- The toy milestone can be generated and validated from disk.
- The first generated task can be dispatched with canonical run evidence.
`,
    );

    const roadmap = await invokeCli(root, [
      "plan",
      "generate-roadmap",
      "--milestones",
      "M101:Toy Greeting Flow",
      "--active-milestone",
      "M101",
    ]);
    expect(roadmap.code).toBe(0);

    const milestone = await invokeCli(root, [
      "plan",
      "generate-milestone",
      "--milestone",
      "M101",
      "--title",
      "Toy Greeting Flow",
      "--objective",
      "Create a tiny toy milestone that can be planned, queued, and dispatched end to end.",
      "--why-now",
      "The playground path should prove artifact generation before a serious demo relies on it.",
      "--exit-criteria",
      "Milestone artifacts validate from disk|A generated slice can produce ready task units",
      "--activate",
      "--replace-queue",
    ]);
    expect(milestone.code).toBe(0);

    const slice = await invokeCli(root, [
      "plan",
      "generate-slice",
      "--unit",
      "M101/S01",
      "--title",
      "Ship the toy hello path",
      "--demo",
      "An operator can generate a toy slice and dispatch its first task without manual vault scaffolding.",
      "--acceptance",
      "Create a dispatchable toy task chain|Keep the toy slice bounded and inspectable",
      "--likely-files",
      "src/toy.ts|tests/toy.test.ts",
    ]);
    expect(slice.code).toBe(0);

    const tasks = await invokeCli(root, [
      "plan",
      "generate-tasks",
      "--unit",
      "M101/S01",
      "--count",
      "2",
      "--likely-files",
      "src/toy.ts|tests/toy.test.ts",
      "--verification",
      "pnpm test|pnpm cli plan validate --unit M101/S01",
    ]);
    expect(tasks.code).toBe(0);

    const validate = await invokeCli(root, ["plan", "validate", "--unit", "M101/S01"]);
    expect(validate.code).toBe(0);
    expect(JSON.parse(validate.stdout)).toMatchObject({
      ok: true,
      validations: [expect.objectContaining({ unit_id: "M101/S01", ok: true })],
    });

    const sync = await invokeCli(root, ["plan", "sync"]);
    expect(sync.code).toBe(0);
    const synced = JSON.parse(sync.stdout);
    expect(synced.reconciled_state.queue_head).toBe("M101/S01/T01");

    const show = await invokeCli(root, ["next-action", "show", "--json"]);
    expect(show.code).toBe(0);
    const preview = JSON.parse(show.stdout);
    expect(preview.decision).toMatchObject({
      unit_id: "M101/S01/T01",
      role: "implementer",
      runtime: "codex",
    });

    const doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(0);

    const codexPath = writeExecutable(root, "bin/codex-playground-toy", codexToyStub());
    updateRuntimeCommand(root, "codex", codexPath);

    const dispatch = await invokeCli(root, ["next-action", "dispatch"]);
    expect(dispatch.code).toBe(0);
    const payload = JSON.parse(dispatch.stdout);
    expect(payload.result).toMatchObject({
      status: "success",
      summary: "toy task completed",
    });

    expect(readText(root, "vault/roadmap.md")).toContain("`M101` / Toy Greeting Flow");
    expect(readText(root, "vault/index.md")).toContain("`M101`");
    expect(readText(root, "vault/milestones/README.md")).toContain("`M101/` / Toy Greeting Flow");
    expect(readText(root, "vault/assumptions.md")).toContain("the toy project can use a single source file");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/transcript.md`)).toContain("toy task completed");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/events.jsonl`)).toContain("\"type\":\"run.created\"");
  });
});
