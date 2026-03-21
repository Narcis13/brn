/**
 * SUPER_CLAUDE — Session Report Generation
 * Generates and persists session reports when the orchestrator loop ends.
 * Per spec §14.5: Session report with summary, tasks, issues, blocked items, cost.
 */

import type { SessionReport } from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Session Lifecycle ──────────────────────────────────────────

/**
 * Create a new session. Called when the orchestrator loop starts.
 */
export function createSession(sessionId: string): SessionReport {
  return {
    session: sessionId,
    started: new Date().toISOString(),
    ended: "",
    status: "completed",
    tasksCompleted: [],
    issuesEncountered: [],
    blockedItems: [],
    totalCost: 0,
  };
}

/**
 * Finalize a session. Called when the orchestrator loop ends.
 */
export function endSession(
  session: SessionReport,
  status: SessionReport["status"],
  totalCost: number
): SessionReport {
  return {
    ...session,
    ended: new Date().toISOString(),
    status,
    totalCost,
  };
}

// ─── Report Generation ──────────────────────────────────────────

/**
 * Generate a markdown session report per spec §14.5 format.
 */
export function generateSessionReport(report: SessionReport): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`session: ${report.session}`);
  lines.push(`started: ${report.started}`);
  lines.push(`ended: ${report.ended}`);
  lines.push(`status: ${report.status}`);
  lines.push("---");
  lines.push("");

  // Tasks completed
  lines.push("## Tasks Completed");
  if (report.tasksCompleted.length > 0) {
    for (const task of report.tasksCompleted) {
      lines.push(`- [x] ${task}`);
    }
  } else {
    lines.push("_None_");
  }
  lines.push("");

  // Issues encountered
  lines.push("## Issues Encountered");
  if (report.issuesEncountered.length > 0) {
    for (const issue of report.issuesEncountered) {
      lines.push(`- ${issue}`);
    }
  } else {
    lines.push("_None_");
  }
  lines.push("");

  // Blocked items
  lines.push("## Blocked Items");
  if (report.blockedItems.length > 0) {
    for (const item of report.blockedItems) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("_None_");
  }
  lines.push("");

  // Token usage
  lines.push("## Token Usage");
  lines.push(`- Total: $${report.totalCost.toFixed(2)}`);
  lines.push("");

  return lines.join("\n");
}

// ─── Persistence ────────────────────────────────────────────────

/**
 * Write a session report to disk.
 */
export async function writeSessionReport(
  projectRoot: string,
  report: SessionReport
): Promise<void> {
  const dir = `${projectRoot}/${PATHS.history}/sessions`;
  await Bun.$`mkdir -p ${dir}`.quiet();

  const md = generateSessionReport(report);
  await Bun.write(`${dir}/session-${report.session}.md`, md);
}

/**
 * Load a session report from disk.
 * Returns null if the report doesn't exist.
 */
export async function loadSessionReport(
  projectRoot: string,
  sessionId: string
): Promise<SessionReport | null> {
  const path = `${projectRoot}/${PATHS.history}/sessions/session-${sessionId}.md`;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return parseSessionReport(content, sessionId);
}

// ─── Parsing ────────────────────────────────────────────────────

function parseSessionReport(content: string, sessionId: string): SessionReport {
  const report: SessionReport = {
    session: sessionId,
    started: "",
    ended: "",
    status: "completed",
    tasksCompleted: [],
    issuesEncountered: [],
    blockedItems: [],
    totalCost: 0,
  };

  // Parse frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch?.[1]) {
    for (const line of fmMatch[1].split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      switch (key) {
        case "session":
          report.session = value;
          break;
        case "started":
          report.started = value;
          break;
        case "ended":
          report.ended = value;
          break;
        case "status":
          report.status = value as SessionReport["status"];
          break;
      }
    }
  }

  // Parse sections
  const sections = content.split(/\n## /);
  for (const section of sections) {
    if (section.startsWith("Tasks Completed")) {
      report.tasksCompleted = parseListItems(section, /^- \[x\] (.+)$/gm);
    } else if (section.startsWith("Issues Encountered")) {
      report.issuesEncountered = parseListItems(section, /^- (.+)$/gm);
    } else if (section.startsWith("Blocked Items")) {
      report.blockedItems = parseListItems(section, /^- (.+)$/gm);
    } else if (section.startsWith("Token Usage")) {
      const costMatch = section.match(/\$(\d+\.?\d*)/);
      if (costMatch?.[1]) {
        report.totalCost = parseFloat(costMatch[1]);
      }
    }
  }

  return report;
}

// ─── Session Continuity ──────────────────────────────────────────

/**
 * Write session continuity CONTINUE.md for the current task.
 * Called at end of every session (not just crashes) so next session has context.
 */
export async function writeSessionContinue(
  projectRoot: string,
  state: import("./types.ts").ProjectState,
  session: SessionReport
): Promise<void> {
  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;
  if (!m || !s || !t) return;

  const continuePath = `${projectRoot}/${PATHS.taskPath(m, s, t)}/CONTINUE.md`;

  // Don't overwrite if task is complete (CONTINUE.md already cleaned up)
  const summaryPath = `${projectRoot}/${PATHS.taskPath(m, s, t)}/SUMMARY.md`;
  if (await Bun.file(summaryPath).exists()) return;

  // Don't write if this task wasn't actually worked on this session.
  // State may have advanced to the next task after completing the previous one,
  // so the current task is fresh — writing a CONTINUE.md would inject stale context.
  const taskPlanPath = `${projectRoot}/${PATHS.taskPath(m, s, t)}/PLAN.md`;
  const taskPlanFile = Bun.file(taskPlanPath);
  if (await taskPlanFile.exists()) {
    const planContent = await taskPlanFile.text();
    const taskStatus = planContent.match(/^status:\s*(\S+)/m)?.[1];
    if (taskStatus === "pending") return; // Task was never started — don't pollute it
  }

  const lines: string[] = [
    "---",
    `task: ${t}`,
    `slice: ${s}`,
    `milestone: ${m}`,
    `session: ${session.session}`,
    `phase: ${state.phase}`,
    `tdd_sub_phase: ${state.tddSubPhase ?? "none"}`,
    "---",
    "",
    "## What Was Accomplished This Session",
  ];

  if (session.tasksCompleted.length > 0) {
    for (const task of session.tasksCompleted) {
      lines.push(`- ${task}`);
    }
  } else {
    lines.push("- No tasks completed");
  }

  lines.push("");
  lines.push("## What Was Attempted But Failed");

  if (session.issuesEncountered.length > 0) {
    for (const issue of session.issuesEncountered) {
      lines.push(`- ${issue}`);
    }
  } else {
    lines.push("- No failures");
  }

  lines.push("");
  lines.push("## What Next Session Should Try");

  if (session.blockedItems.length > 0) {
    lines.push("- Address blocked items:");
    for (const item of session.blockedItems) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("- Continue from current state");
  }

  await Bun.write(continuePath, lines.join("\n"));
}

// ─── Parsing ────────────────────────────────────────────────────

function parseListItems(section: string, pattern: RegExp): string[] {
  const items: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(section)) !== null) {
    if (match[1] && match[1] !== "_None_") {
      items.push(match[1]);
    }
  }
  return items;
}
