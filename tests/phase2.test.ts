import { describe, expect, test } from "vitest";

import type { RuntimeRegistry } from "../src/supercodex/runtime/types.js";
import { createTempGitRepo, invokeCli, readJson, readText, writeExecutable, writeJson } from "./helpers.js";

function codexStub(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

if (args.includes("--version")) {
  console.log("codex 9.9.9");
  process.exit(0);
}

const outputIndex = args.indexOf("--output-last-message");
if (outputIndex === -1 || !args[outputIndex + 1]) {
  console.error("missing output path");
  process.exit(2);
}

const outputPath = args[outputIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    status: "success",
    summary: "codex dispatch",
    tests_written: ["tests/runtime/codex.test.ts"],
    tests_run: ["pnpm test -- runtime"],
    verification_evidence: ["stub codex execution completed"],
    assumptions: [],
    blockers: [],
    followups: ["inspect collect output"]
  }) + "\\n",
  "utf8",
);
fs.writeFileSync(path.join(process.cwd(), "artifact-codex.txt"), "codex artifact\\n", "utf8");
console.log(JSON.stringify({ event: "session.started", session_id: "codex-session-123" }));
process.exit(0);
`;
}

function claudeStub(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

if (args.includes("--version")) {
  console.log("claude 1.2.3");
  process.exit(0);
}

const resumeIndex = args.indexOf("-r");
const sessionIndex = args.indexOf("--session-id");
const resuming = resumeIndex !== -1;
const sessionId = resuming ? args[resumeIndex + 1] : args[sessionIndex + 1];

fs.writeFileSync(
  path.join(process.cwd(), resuming ? "artifact-claude-2.txt" : "artifact-claude-1.txt"),
  resuming ? "resume artifact\\n" : "dispatch artifact\\n",
  "utf8",
);

console.log(
  JSON.stringify({
    session_id: sessionId,
    result: {
      status: "success",
      summary: resuming ? "claude resume" : "claude dispatch",
      tests_written: resuming ? [] : ["tests/runtime/claude.test.ts"],
      tests_run: resuming ? ["pnpm test -- resume"] : ["pnpm test -- claude"],
      verification_evidence: [resuming ? "resume completed" : "dispatch completed"],
      assumptions: [],
      blockers: [],
      followups: resuming ? ["collect the resumed run"] : ["resume the session"]
    }
  })
);
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

describe("Phase 2 runtime adapters", () => {
  test("runtime probe records availability and version for both runtimes", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const codexPath = writeExecutable(root, "bin/codex-stub", codexStub());
    const claudePath = writeExecutable(root, "bin/claude-stub", claudeStub());
    updateRuntimeCommand(root, "codex", codexPath);
    updateRuntimeCommand(root, "claude", claudePath);

    const probe = await invokeCli(root, ["runtime", "probe"]);
    expect(probe.code).toBe(0);

    const results = JSON.parse(probe.stdout);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtime: "codex",
          available: true,
          path: codexPath,
        }),
        expect.objectContaining({
          runtime: "claude",
          available: true,
          path: claudePath,
        }),
      ]),
    );

    const registry = readJson<RuntimeRegistry>(root, ".supercodex/runtime/adapters.json");
    expect(registry.runtimes.codex.last_probe?.version).toContain("9.9.9");
    expect(registry.runtimes.claude.last_probe?.version).toContain("1.2.3");
  });

  test("codex dispatch persists a normalized result that can be collected", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const codexPath = writeExecutable(root, "bin/codex-stub", codexStub());
    updateRuntimeCommand(root, "codex", codexPath);

    const dispatch = await invokeCli(root, [
      "runtime",
      "dispatch",
      "--runtime",
      "codex",
      "--packet",
      ".supercodex/prompts/dispatch.json",
    ]);
    expect(dispatch.code).toBe(0);

    const payload = JSON.parse(dispatch.stdout);
    expect(payload.result).toMatchObject({
      runtime: "codex",
      status: "success",
      summary: "codex dispatch",
      session_id: "codex-session-123",
    });
    expect(payload.result.files_changed).toContain("artifact-codex.txt");
    expect(readText(root, payload.result.raw_ref)).toContain("codex dispatch");

    const collect = await invokeCli(root, ["runtime", "collect", "--run-id", payload.handle.run_id]);
    expect(collect.code).toBe(0);
    expect(JSON.parse(collect.stdout)).toMatchObject({
      result: {
        run_id: payload.handle.run_id,
        summary: "codex dispatch",
      },
    });
  });

  test("claude dispatch can be resumed with the stored session id", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const claudePath = writeExecutable(root, "bin/claude-stub", claudeStub());
    updateRuntimeCommand(root, "claude", claudePath);

    const dispatch = await invokeCli(root, [
      "runtime",
      "dispatch",
      "--runtime",
      "claude",
      "--packet",
      ".supercodex/prompts/dispatch.json",
    ]);
    expect(dispatch.code).toBe(0);

    const first = JSON.parse(dispatch.stdout);
    expect(first.result).toMatchObject({
      runtime: "claude",
      status: "success",
      summary: "claude dispatch",
    });
    expect(first.result.files_changed).toContain("artifact-claude-1.txt");
    expect(typeof first.result.session_id).toBe("string");

    const resume = await invokeCli(root, [
      "runtime",
      "resume",
      "--run-id",
      first.handle.run_id,
      "--prompt",
      "Continue and report again",
    ]);
    expect(resume.code).toBe(0);

    const second = JSON.parse(resume.stdout);
    expect(second.handle.parent_run_id).toBe(first.handle.run_id);
    expect(second.result).toMatchObject({
      runtime: "claude",
      status: "success",
      summary: "claude resume",
      session_id: first.result.session_id,
    });
    expect(second.result.files_changed).toContain("artifact-claude-2.txt");
  });
});
