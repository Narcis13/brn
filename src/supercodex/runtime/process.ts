import { spawn } from "node:child_process";

export interface RunCommandOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  run_id?: string;
  on_spawn?: (pid: number) => void;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  signal: NodeJS.Signals | null;
  duration_ms: number;
  pid: number | null;
}

const activeProcesses = new Map<string, number>();

export async function runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
  const startedAt = Date.now();

  return await new Promise<RunCommandResult>((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.once("spawn", () => {
      if (options.run_id && child.pid) {
        activeProcesses.set(options.run_id, child.pid);
      }

      if (child.pid) {
        options.on_spawn?.(child.pid);
      }
    });

    child.once("error", (error) => {
      if (options.run_id) {
        activeProcesses.delete(options.run_id);
      }
      reject(error);
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.once("close", (code, signal) => {
      if (options.run_id) {
        activeProcesses.delete(options.run_id);
      }

      resolve({
        stdout,
        stderr,
        exit_code: code ?? -1,
        signal,
        duration_ms: Date.now() - startedAt,
        pid: child.pid ?? null,
      });
    });
  });
}

export function cancelActiveRun(runId: string): boolean {
  const pid = activeProcesses.get(runId);
  if (!pid) {
    return false;
  }

  return terminatePid(pid);
}

export function terminatePid(pid: number): boolean {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}
