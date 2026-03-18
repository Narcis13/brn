import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { CurrentState } from "../src/supercodex/types.js";
import { createTempGitRepo, invokeCli, readJson, readText } from "./helpers.js";

describe("Phase 1 CLI", () => {
  test("init seeds the project and doctor passes", async () => {
    const root = createTempGitRepo();

    const init = await invokeCli(root, ["init"]);
    expect(init.code).toBe(0);

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.project_root).toBe(root);
    expect(current.active_milestone).toBe("M002");
    expect(current.queue_head).toBe("M002/S01");
    expect(current.last_transition_at).toBeTruthy();

    const doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(0);
    expect(JSON.parse(doctor.stdout)).toEqual({
      ok: true,
      issues: [],
    });
  });

  test("queue operations advance queue_head deterministically", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const next = await invokeCli(root, ["queue", "next"]);
    expect(JSON.parse(next.stdout)).toMatchObject({ unit_id: "M002/S01" });

    const markDone = await invokeCli(root, ["queue", "mark-done", "M002/S01"]);
    expect(markDone.code).toBe(0);

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.queue_head).toBe("M002/S02");

    const add = await invokeCli(root, [
      "queue",
      "add",
      "M002/S99",
      "--type",
      "slice",
      "--depends-on",
      "M002/S04",
      "--milestone",
      "M002",
      "--slice",
      "S99",
      "--notes",
      "Late follow-up slice",
    ]);
    expect(add.code).toBe(0);

    const remove = await invokeCli(root, ["queue", "remove", "M002/S99"]);
    expect(remove.code).toBe(0);
  });

  test("lock commands reject collisions", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const first = await invokeCli(root, [
      "lock",
      "acquire",
      "vault/index.md",
      "--owner",
      "tester",
      "--scope",
      "slice",
      "--reason",
      "exclusive review",
    ]);
    expect(first.code).toBe(0);

    const second = await invokeCli(root, [
      "lock",
      "acquire",
      "vault/index.md",
      "--owner",
      "other",
      "--scope",
      "slice",
      "--reason",
      "collision",
    ]);
    expect(second.code).toBe(1);
    expect(second.stderr).toContain("Lock already exists");

    const list = await invokeCli(root, ["lock", "list"]);
    expect(JSON.parse(list.stdout)).toHaveLength(1);

    const release = await invokeCli(root, ["lock", "release", "vault/index.md"]);
    expect(release.code).toBe(0);
  });

  test("state transition appends the journal and reconcile tracks task branches", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    const transition = await invokeCli(root, [
      "state",
      "transition",
      "--to",
      "dispatch",
      "--reason",
      "Queue head is ready for implementation",
      "--unit",
      "M002/S01",
    ]);
    expect(transition.code).toBe(0);

    const transitions = readText(root, ".supercodex/state/transitions.jsonl")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(transitions).toHaveLength(2);
    expect(transitions.at(-1)).toMatchObject({
      from_phase: "plan",
      to_phase: "dispatch",
      unit_id: "M002/S01",
    });

    execFileSync("git", ["checkout", "-b", "task/M002-S01-T01"], { cwd: root, stdio: "pipe" });
    const reconcile = await invokeCli(root, ["state", "reconcile"]);
    expect(reconcile.code).toBe(0);

    const current = readJson<CurrentState>(root, ".supercodex/state/current.json");
    expect(current.git.task_branch).toBe("task/M002-S01-T01");
    expect(current.phase).toBe("dispatch");
  });

  test("doctor fails on placeholder content and transition drift", async () => {
    const root = createTempGitRepo();
    await invokeCli(root, ["init"]);

    writeFileSync(
      join(root, "vault/vision.md"),
      "# Vision\n\nDescribe the real-world outcome this SUPER_CODEX project is trying to create.\n",
      "utf8",
    );

    let doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain("Placeholder content remains in vault/vision.md");

    writeFileSync(
      join(root, ".supercodex/state/current.json"),
      JSON.stringify(
        {
          ...readJson<CurrentState>(root, ".supercodex/state/current.json"),
          phase: "verify",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    doctor = await invokeCli(root, ["doctor"]);
    expect(doctor.code).toBe(1);
    expect(doctor.stdout).toContain("current phase verify does not match latest transition plan");
  });
});
