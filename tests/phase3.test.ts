import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import type { CurrentState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson, writeText } from "./helpers.js";

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
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/transcript.md`)).toContain("## Result");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/events.jsonl`)).toContain("\"type\":\"runtime.completed\"");
    expect(readJson(root, `.supercodex/runs/${payload.handle.run_id}/continuation.json`)).toMatchObject({
      run_id: payload.handle.run_id,
      status: "success",
      unit_id: "M002/S01",
    });
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/continue.md`)).toContain("Status: success");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/checkpoints/001-pre-dispatch.json`)).toContain("\"kind\": \"pre_dispatch\"");
    expect(readText(root, `.supercodex/runs/${payload.handle.run_id}/checkpoints/002-post-result.json`)).toContain("\"kind\": \"post_result\"");
    expect(readText(root, "vault/assumptions.md")).toContain("existing conventions stay in place");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("implement");
    expect(current.active_runtime).toBe("codex");
    expect(current.current_run_id).toBe(payload.handle.run_id);
    expect(current.recovery_ref).toBe(`.supercodex/runs/${payload.handle.run_id}/continue.md`);
  });

  test("next-action show ignores fenced markdown noise when building files and tests", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    writeText(
      root,
      "SUPER_CODEX.md",
      `${readText(root, "SUPER_CODEX.md")}\n\`\`\`\npsuedo output that should be ignored\nsrc/noisy-from-spec.ts\npnpm test -- bogus\n\`\`\`\n`,
    );
    writeText(
      root,
      "vault/milestones/M002/slices/S01/plan.md",
      `${readText(root, "vault/milestones/M002/slices/S01/plan.md")}\n- Run \`pnpm test -- phase3\` before reporting success.\n`,
    );

    const show = await invokeCli(root, ["next-action", "show", "--json"]);
    expect(show.code).toBe(0);

    const payload = JSON.parse(show.stdout);
    expect(payload.packet.files_in_scope).not.toContain("src/noisy-from-spec.ts");
    expect(payload.packet.tests).not.toContain("pnpm test -- bogus");
    expect(payload.packet.tests).toContain("pnpm test -- phase3");
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

  test("feedback ask and ingest resolve the question and move state into recovery", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const ask = await invokeCli(root, [
      "feedback",
      "ask",
      "--scope",
      "M002/S01",
      "--issue",
      "Choose the runtime for the first playground demo.",
      "--why-blocked",
      "A human should decide whether the demo should prefer claude or codex.",
      "--severity",
      "high",
      "--type",
      "decision",
      "--options",
      "A: prefer claude|B: prefer codex",
      "--recommended",
      "B: prefer codex",
      "--pause-point",
      "Before dispatching the first demo slice.",
    ]);
    expect(ask.code).toBe(0);

    const asked = JSON.parse(ask.stdout);
    expect(asked.id).toMatch(/^Q-\d{4}-\d{2}-\d{2}-\d{3}$/);
    expect(asked.state.phase).toBe("awaiting_human");

    writeText(
      root,
      "vault/feedback/ANSWERS.md",
      `${readText(root, "vault/feedback/ANSWERS.md")}\n\n## A-2026-03-19-001\n\n- Responds to: ${asked.id}\n- Decision: Prefer codex for the first playground demo.\n- Reason: The demo should exercise the default implementation runtime first.\n- Entered by: operator\n- Entered at: 2026-03-19T10:00:00.000Z\n- Status: pending\n- Ingested at: \n`,
    );

    const ingest = await invokeCli(root, ["feedback", "ingest"]);
    expect(ingest.code).toBe(0);

    const ingested = JSON.parse(ingest.stdout);
    expect(ingested.ok).toBe(true);
    expect(ingested.processed).toEqual([
      expect.objectContaining({
        answer_id: "A-2026-03-19-001",
        target_id: asked.id,
        target_kind: "question",
        scope: "M002/S01",
      }),
    ]);
    expect(ingested.state.phase).toBe("recover");

    const questions = readText(root, "vault/feedback/QUESTIONS.md");
    expect(questions).toContain(`## ${asked.id}`);
    expect(questions).toContain("- Status: resolved");
    expect(questions).toContain("- Answered by: A-2026-03-19-001");

    const answers = readText(root, "vault/feedback/ANSWERS.md");
    expect(answers).toContain("- Status: ingested");
    expect(answers).toContain("- Ingested at:");

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.phase).toBe("recover");
    expect(current.awaiting_human).toBe(false);
    expect(current.metrics.human_interventions).toBe(1);
  });
});
