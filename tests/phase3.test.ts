import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import type { CurrentState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson } from "./helpers.js";

function codexSuccessStub(): string {
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
    status: "success",
    summary: "codex dispatch",
    tests_written: ["tests/phase3/codex.test.ts"],
    tests_run: ["pnpm test -- phase3"],
    verification_evidence: ["phase 3 codex execution completed"],
    assumptions: ["existing conventions stay in place"],
    blockers: [],
    followups: ["move to verification"]
  }) + "\\n",
  "utf8",
);
fs.writeFileSync(path.join(process.cwd(), "phase3-artifact.txt"), "phase3 artifact\\n", "utf8");
console.log(JSON.stringify({ event: "session.started", session_id: "codex-session-phase3" }));
process.exit(0);
`;
}

function codexBlockedStub(): string {
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
    status: "blocked",
    summary: "waiting on operator input",
    tests_written: [],
    tests_run: [],
    verification_evidence: [],
    assumptions: [],
    blockers: ["Need a human decision before continuing."],
    followups: ["Check BLOCKERS.md"]
  }) + "\\n",
  "utf8",
);
console.log(JSON.stringify({ event: "session.started", session_id: "codex-session-blocked" }));
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

describe("Phase 3 next-action synthesis", () => {
  test("next-action show synthesizes a packet from disk-backed state", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const show = await invokeCli(root, ["next-action", "show", "--json"]);
    expect(show.code).toBe(0);

    const payload = JSON.parse(show.stdout);
    expect(payload.decision).toMatchObject({
      action: "dispatch",
      unit_id: "M002/S01",
      role: "implementer",
      runtime: "codex",
    });
    expect(payload.context_manifest.refs).toEqual(
      expect.arrayContaining([
        "SUPER_CODEX.md",
        ".supercodex/state/current.json",
        "vault/milestones/M002/slices/S01/plan.md",
      ]),
    );
    expect(payload.packet).toMatchObject({
      unit_id: "M002/S01",
      unit_type: "slice",
      role: "implementer",
    });
    expect(payload.packet.acceptance_criteria).toEqual(
      expect.arrayContaining([
        "Define runtime ids, capabilities, dispatch packet, probe result, run handle, and normalized result types.",
      ]),
    );
  });

  test("next-action dispatch persists canonical run artifacts and updates state", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const codexPath = writeExecutable(root, "bin/codex-stub", codexSuccessStub());
    updateRuntimeCommand(root, "codex", codexPath);

    const dispatch = await invokeCli(root, ["next-action", "dispatch"]);
    expect(dispatch.code).toBe(0);

    const payload = JSON.parse(dispatch.stdout);
    expect(payload.result).toMatchObject({
      runtime: "codex",
      status: "success",
      summary: "codex dispatch",
    });
    expect(payload.record).toMatchObject({
      run_id: payload.handle.run_id,
      unit_id: "M002/S01",
      action: "dispatch",
      status: "success",
    });

    const record = readJson(root, `.supercodex/runs/${payload.handle.run_id}/record.json`);
    expect(record).toMatchObject({
      run_id: payload.handle.run_id,
      normalized_ref: `.supercodex/runs/${payload.handle.run_id}/normalized.json`,
    });
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/prompt.md`)).toContain("SUPER_CODEX dispatch packet");
    expect(readJson(root, `.supercodex/runs/${payload.handle.run_id}/continuation.json`)).toMatchObject({
      run_id: payload.handle.run_id,
      status: "success",
      unit_id: "M002/S01",
    });
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/continue.md`)).toContain("Status: success");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/checkpoints/001-pre-dispatch.json`)).toContain("\"kind\": \"pre_dispatch\"");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/checkpoints/002-post-result.json`)).toContain("\"kind\": \"post_result\"");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("implement");
    expect(current.active_runtime).toBe("codex");
    expect(current.current_run_id).toBe(payload.handle.run_id);
    expect(current.recovery_ref).toBe(`.supercodex/runs/${payload.handle.run_id}/continue.md`);
  });

  test("blocked dispatch writes a blocker entry and leaves state blocked", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const codexPath = writeExecutable(root, "bin/codex-blocked", codexBlockedStub());
    updateRuntimeCommand(root, "codex", codexPath);

    const dispatch = await invokeCli(root, ["next-action", "dispatch"]);
    expect(dispatch.code).toBe(0);

    const payload = JSON.parse(dispatch.stdout);
    expect(payload.result).toMatchObject({
      status: "blocked",
      summary: "waiting on operator input",
    });

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("blocked");
    expect(current.blocked).toBe(true);

    const blockers = readText(root, "vault/feedback/BLOCKERS.md");
    expect(blockers).toContain("M002/S01");
    expect(blockers).toContain(payload.handle.run_id);
    expect(blockers).toContain("Need a human decision before continuing.");
  });
});
