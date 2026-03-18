/**
 * SUPER_CLAUDE — Dashboard / Progress View
 * Renders a human-readable progress view of the current project state.
 * Shows milestones, slices, tasks, budget, and system health.
 */

import { readState } from "./state.ts";
import { listMilestones, listSlices, listTasks } from "./milestone-manager.ts";
import { computePressure, type PressurePolicy } from "./budget-pressure.ts";
import { generateMetricsSummary } from "./metrics.ts";
import type { CostTracker } from "./cost.ts";
import type { ProjectState } from "./types.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface DashboardData {
  state: ProjectState;
  milestones: MilestoneDashboard[];
  budget: BudgetDashboard;
  health: HealthDashboard;
}

export interface MilestoneDashboard {
  id: string;
  description: string;
  status: string;
  progress: number;
  slices: SliceDashboard[];
}

export interface SliceDashboard {
  id: string;
  demoSentence: string;
  status: string;
  taskCount: number;
  completedTasks: number;
}

export interface BudgetDashboard {
  currentCost: number;
  budgetCeiling: number;
  percentUsed: number;
  pressureTier: string;
}

export interface HealthDashboard {
  compoundingScore: number;
  sessionsTracked: number;
  trend: string;
}

// ─── Dashboard Assembly ─────────────────────────────────────────

export async function assembleDashboard(
  projectRoot: string,
  costTracker: CostTracker | null,
  budgetCeiling: number
): Promise<DashboardData> {
  const state = await readState(projectRoot);

  // Milestones
  const milestoneInfos = await listMilestones(projectRoot);
  const milestones: MilestoneDashboard[] = [];

  for (const mi of milestoneInfos) {
    const sliceInfos = await listSlices(projectRoot, mi.id);
    const slices: SliceDashboard[] = [];

    for (const si of sliceInfos) {
      const taskInfos = await listTasks(projectRoot, mi.id, si.id);
      const completedTasks = taskInfos.filter((t) => t.status === "complete").length;

      slices.push({
        id: si.id,
        demoSentence: si.demoSentence,
        status: si.status,
        taskCount: taskInfos.length,
        completedTasks,
      });
    }

    const totalTasks = slices.reduce((sum, s) => sum + s.taskCount, 0);
    const completedTasks = slices.reduce((sum, s) => sum + s.completedTasks, 0);
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    milestones.push({
      id: mi.id,
      description: mi.description,
      status: mi.status,
      progress,
      slices,
    });
  }

  // Budget
  const currentCost = costTracker?.totalCost ?? 0;
  const pressure = computePressure({ currentCost, budgetCeiling });

  const budget: BudgetDashboard = {
    currentCost,
    budgetCeiling,
    percentUsed: pressure.percentUsed,
    pressureTier: pressure.tier,
  };

  // Health
  let health: HealthDashboard = {
    compoundingScore: 50,
    sessionsTracked: 0,
    trend: "stable",
  };

  try {
    const metricsSummary = await generateMetricsSummary(projectRoot);
    const overallTrend = metricsSummary.trends.length > 0
      ? metricsSummary.trends[0]!.direction
      : "stable";

    health = {
      compoundingScore: metricsSummary.compoundingScore,
      sessionsTracked: metricsSummary.sessions,
      trend: overallTrend,
    };
  } catch {
    // Metrics may not exist yet
  }

  return { state, milestones, budget, health };
}

// ─── Rendering ──────────────────────────────────────────────────

export function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];

  // Header
  lines.push("╔══════════════════════════════════════════════════════╗");
  lines.push("║             SUPER_CLAUDE — Dashboard                ║");
  lines.push("╚══════════════════════════════════════════════════════╝");
  lines.push("");

  // Current State
  lines.push("┌─── Current State ────────────────────────────────────┐");
  lines.push(`│  Phase:     ${data.state.phase.padEnd(40)}│`);
  lines.push(`│  TDD:       ${(data.state.tddSubPhase ?? "n/a").padEnd(40)}│`);
  lines.push(`│  Milestone: ${(data.state.currentMilestone ?? "none").padEnd(40)}│`);
  lines.push(`│  Slice:     ${(data.state.currentSlice ?? "none").padEnd(40)}│`);
  lines.push(`│  Task:      ${(data.state.currentTask ?? "none").padEnd(40)}│`);
  lines.push("└──────────────────────────────────────────────────────┘");
  lines.push("");

  // Budget
  const budgetBar = renderProgressBar(data.budget.percentUsed, 30);
  const tierIcon = {
    GREEN: "[GREEN]",
    YELLOW: "[YELLOW]",
    ORANGE: "[ORANGE]",
    RED: "[RED]",
  }[data.budget.pressureTier] ?? "[?]";

  lines.push("┌─── Budget ───────────────────────────────────────────┐");
  lines.push(`│  ${budgetBar} ${data.budget.percentUsed.toFixed(1)}%`.padEnd(54) + "│");
  lines.push(`│  $${data.budget.currentCost.toFixed(2)} / $${data.budget.budgetCeiling.toFixed(2)} ${tierIcon}`.padEnd(54) + "│");
  lines.push("└──────────────────────────────────────────────────────┘");
  lines.push("");

  // Milestones
  if (data.milestones.length > 0) {
    lines.push("┌─── Milestones ──────────────────────────────────────┐");
    for (const m of data.milestones) {
      const progressBar = renderProgressBar(m.progress, 20);
      const statusIcon = statusToIcon(m.status);
      lines.push(`│  ${statusIcon} ${m.id}: ${m.description}`.padEnd(54).slice(0, 54) + "│");
      lines.push(`│     ${progressBar} ${m.progress.toFixed(0)}%`.padEnd(54) + "│");

      // Slices
      for (const s of m.slices) {
        const sliceIcon = statusToIcon(s.status);
        const taskProgress = s.taskCount > 0 ? `${s.completedTasks}/${s.taskCount}` : "0/0";
        lines.push(`│     ${sliceIcon} ${s.id}: ${s.demoSentence}`.padEnd(54).slice(0, 54) + "│");
        lines.push(`│        Tasks: ${taskProgress}`.padEnd(54) + "│");
      }
      lines.push("│".padEnd(54) + "│");
    }
    lines.push("└──────────────────────────────────────────────────────┘");
  } else {
    lines.push("┌─── Milestones ──────────────────────────────────────┐");
    lines.push("│  No milestones planned yet.".padEnd(54) + "│");
    lines.push("└──────────────────────────────────────────────────────┘");
  }
  lines.push("");

  // Health
  const healthBar = renderProgressBar(data.health.compoundingScore, 20);
  const trendIcon = {
    improving: "^",
    stable: "=",
    degrading: "v",
  }[data.health.trend] ?? "?";

  lines.push("┌─── System Health ────────────────────────────────────┐");
  lines.push(`│  Compounding: ${healthBar} ${data.health.compoundingScore}/100`.padEnd(54) + "│");
  lines.push(`│  Sessions:    ${data.health.sessionsTracked}`.padEnd(54) + "│");
  lines.push(`│  Trend:       ${data.health.trend} ${trendIcon}`.padEnd(54) + "│");
  lines.push("└──────────────────────────────────────────────────────┘");

  return lines.join("\n");
}

// ─── Markdown Report ────────────────────────────────────────────

export function renderDashboardMarkdown(data: DashboardData): string {
  const lines: string[] = [];

  lines.push("# SUPER_CLAUDE — Progress Report");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");

  // Current State
  lines.push("## Current State");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Phase | ${data.state.phase} |`);
  lines.push(`| TDD Sub-Phase | ${data.state.tddSubPhase ?? "n/a"} |`);
  lines.push(`| Milestone | ${data.state.currentMilestone ?? "none"} |`);
  lines.push(`| Slice | ${data.state.currentSlice ?? "none"} |`);
  lines.push(`| Task | ${data.state.currentTask ?? "none"} |`);
  lines.push("");

  // Budget
  lines.push("## Budget");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Current Cost | $${data.budget.currentCost.toFixed(2)} |`);
  lines.push(`| Budget Ceiling | $${data.budget.budgetCeiling.toFixed(2)} |`);
  lines.push(`| Usage | ${data.budget.percentUsed.toFixed(1)}% |`);
  lines.push(`| Pressure Tier | ${data.budget.pressureTier} |`);
  lines.push("");

  // Milestones
  lines.push("## Milestones");
  if (data.milestones.length === 0) {
    lines.push("_No milestones planned yet._");
  } else {
    for (const m of data.milestones) {
      lines.push(`### ${m.id}: ${m.description}`);
      lines.push(`**Status:** ${m.status} | **Progress:** ${m.progress.toFixed(0)}%`);
      lines.push("");

      if (m.slices.length > 0) {
        lines.push(`| Slice | Demo | Status | Tasks |`);
        lines.push(`|---|---|---|---|`);
        for (const s of m.slices) {
          const taskProgress = s.taskCount > 0 ? `${s.completedTasks}/${s.taskCount}` : "0/0";
          lines.push(`| ${s.id} | ${s.demoSentence} | ${s.status} | ${taskProgress} |`);
        }
      }
      lines.push("");
    }
  }

  // Health
  lines.push("## System Health");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Compounding Score | ${data.health.compoundingScore}/100 |`);
  lines.push(`| Sessions Tracked | ${data.health.sessionsTracked} |`);
  lines.push(`| Trend | ${data.health.trend} |`);

  return lines.join("\n");
}

// ─── Write Dashboard to Disk ────────────────────────────────────

export async function writeDashboard(
  projectRoot: string,
  data: DashboardData
): Promise<void> {
  const md = renderDashboardMarkdown(data);
  const path = `${projectRoot}/.superclaude/state/DASHBOARD.md`;
  await Bun.write(path, md);
}

// ─── Helpers ────────────────────────────────────────────────────

function renderProgressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}

function statusToIcon(status: string): string {
  switch (status) {
    case "complete":
      return "[x]";
    case "in_progress":
      return "[>]";
    case "pending":
      return "[ ]";
    default:
      return "[?]";
  }
}
