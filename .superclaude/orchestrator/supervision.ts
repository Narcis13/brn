/**
 * SUPER_CLAUDE — Supervision Engine
 * Lock files, timeout management, stuck detection, crash recovery.
 * Per spec §14.4: Timeout tiers, stuck detection, crash recovery via lock files.
 */

import { PATHS } from "./types.ts";

// ─── Lock File Types ────────────────────────────────────────────

export interface LockData {
  milestone: string;
  slice: string;
  task: string;
  pid: number;
  startedAt: string;
}

export interface StuckDetectionResult {
  stuck: boolean;
  reason: string | null;
}

// ─── Timeout Tiers (§14.4) ──────────────────────────────────────

export interface TimeoutConfig {
  soft: number;   // ms — log warning, continue
  idle: number;   // ms — stuck, write CONTINUE.md, restart task
  hard: number;   // ms — stop loop entirely
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  soft: 15 * 60 * 1000,  // 15 min
  idle: 10 * 60 * 1000,  // 10 min
  hard: 30 * 60 * 1000,  // 30 min
};

/**
 * Check which timeout tier has been exceeded.
 * Returns: "none" | "soft" | "idle" | "hard"
 */
export function checkTimeout(
  elapsedMs: number,
  config: TimeoutConfig = DEFAULT_TIMEOUTS
): "none" | "soft" | "idle" | "hard" {
  if (elapsedMs >= config.hard) return "hard";
  if (elapsedMs >= config.soft) return "soft";
  if (elapsedMs >= config.idle) return "idle";
  return "none";
}

// ─── Lock File Operations (§14.4 Crash Recovery) ─────────────────

const LOCK_PATH = PATHS.lockFile;

/**
 * Acquire the auto-mode lock. Returns false if already locked.
 */
export async function acquireLock(
  projectRoot: string,
  milestone: string,
  slice: string,
  task: string
): Promise<boolean> {
  const path = `${projectRoot}/${LOCK_PATH}`;
  const file = Bun.file(path);

  if (await file.exists()) {
    return false;
  }

  const lockData: LockData = {
    milestone,
    slice,
    task,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  await Bun.write(path, JSON.stringify(lockData, null, 2));
  return true;
}

/**
 * Release the auto-mode lock.
 */
export async function releaseLock(projectRoot: string): Promise<void> {
  const path = `${projectRoot}/${LOCK_PATH}`;
  await Bun.$`rm -f ${path}`.quiet();
}

/**
 * Check if the auto-mode lock is held.
 */
export async function isLocked(projectRoot: string): Promise<boolean> {
  const path = `${projectRoot}/${LOCK_PATH}`;
  return await Bun.file(path).exists();
}

/**
 * Read the lock data. Returns null if no lock exists.
 */
export async function readLock(projectRoot: string): Promise<LockData | null> {
  const path = `${projectRoot}/${LOCK_PATH}`;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return JSON.parse(content) as LockData;
}

// ─── Stuck Detection (§14.4) ────────────────────────────────────

/**
 * Detect if a task is stuck based on dispatch history.
 * Per spec: "If the same task dispatches twice without progress → retry with Doctor agent"
 */
export function detectStuck(
  currentTask: string,
  dispatchHistory: Array<{ task: string; timestamp: string }>
): StuckDetectionResult {
  // Count how many times this exact task appears in recent history
  const sameTaskDispatches = dispatchHistory.filter((d) => d.task === currentTask);

  if (sameTaskDispatches.length >= 2) {
    return {
      stuck: true,
      reason: `Task ${currentTask} dispatched twice without progress`,
    };
  }

  return {
    stuck: false,
    reason: null,
  };
}
