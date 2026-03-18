import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach } from "vitest";

import { runCli } from "../src/cli.js";

const tempDirs: string[] = [];

export function createTempGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "supercodex-phase1-"));
  tempDirs.push(root);

  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root, stdio: "pipe" });
  writeFileSync(join(root, "README.md"), "# temp repo\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "pipe" });

  return root;
}

export async function invokeCli(root: string, args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(args, {
    cwd: root,
    writeOut: (text) => stdout.push(text),
    writeErr: (text) => stderr.push(text),
  });

  return {
    code,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
  };
}

export function readJson<T>(root: string, relativePath: string): T {
  const path = join(root, relativePath);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readText(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

export function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function writeExecutable(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { encoding: "utf8", mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
