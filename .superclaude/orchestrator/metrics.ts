/**
 * SUPER_CLAUDE — Metrics Tracking & Trend Analysis
 * Per spec §12.5: Track per-session metrics, reveal trends over time.
 */

import type {
  SessionMetrics,
  TrendAnalysis,
  TrendDirection,
  TrendPoint,
  MetricsSummary,
  ReviewSeverity,
} from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Create ─────────────────────────────────────────────────────

export function createSessionMetrics(session: string): SessionMetrics {
  return {
    session,
    timestamp: new Date().toISOString(),
    tasksAttempted: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    testsWritten: 0,
    testsPassing: 0,
    testsFailing: 0,
    reviewIssues: { "MUST-FIX": 0, "SHOULD-FIX": 0, "CONSIDER": 0 },
    postmortemsGenerated: 0,
    tokenUsage: {},
    costPerPhase: {},
    totalCost: 0,
    timePerTask: {},
  };
}

// ─── Persistence ────────────────────────────────────────────────

function metricsDir(projectRoot: string): string {
  return `${projectRoot}/${PATHS.history}/metrics`;
}

function metricsPath(projectRoot: string, session: string): string {
  return `${metricsDir(projectRoot)}/metrics-${session}.json`;
}

export async function writeSessionMetrics(
  projectRoot: string,
  metrics: SessionMetrics
): Promise<void> {
  const dir = metricsDir(projectRoot);
  await Bun.$`mkdir -p ${dir}`.quiet();
  await Bun.write(metricsPath(projectRoot, metrics.session), JSON.stringify(metrics, null, 2));
}

export async function loadSessionMetrics(
  projectRoot: string,
  session: string
): Promise<SessionMetrics | null> {
  const path = metricsPath(projectRoot, session);
  const file = Bun.file(path);

  if (!(await file.exists())) return null;

  const content = await file.text();
  return JSON.parse(content) as SessionMetrics;
}

export async function listSessionMetrics(projectRoot: string): Promise<string[]> {
  const dir = metricsDir(projectRoot);
  const glob = new Bun.Glob("metrics-*.json");
  const ids: string[] = [];

  for await (const entry of glob.scan({ cwd: dir })) {
    ids.push(entry.replace("metrics-", "").replace(".json", ""));
  }

  return ids.sort();
}

// ─── Trend Analysis ─────────────────────────────────────────────

/**
 * Compute whether a metric is improving, stable, or degrading.
 * @param higherIsBetter - true for success metrics, false for failure metrics
 */
export function computeTrendDirection(
  current: number,
  previous: number,
  higherIsBetter: boolean
): TrendDirection {
  if (previous === 0 && current === 0) return "stable";

  const threshold = 0.05; // 5% change threshold for "stable"
  const denominator = previous === 0 ? 1 : Math.abs(previous);
  const change = (current - previous) / denominator;

  if (Math.abs(change) < threshold) return "stable";

  if (higherIsBetter) {
    return change > 0 ? "improving" : "degrading";
  }
  return change < 0 ? "improving" : "degrading";
}

/**
 * Analyze a single metric's trend across multiple data points.
 */
export function analyzeTrend(
  metric: string,
  points: TrendPoint[],
  higherIsBetter: boolean
): TrendAnalysis {
  if (points.length <= 1) {
    return {
      metric,
      direction: "stable",
      current: points[0]?.value ?? 0,
      previous: points[0]?.value ?? 0,
      percentChange: 0,
      dataPoints: points,
    };
  }

  const current = points[points.length - 1]!.value;
  const previous = points[points.length - 2]!.value;
  const direction = computeTrendDirection(current, previous, higherIsBetter);

  const denominator = previous === 0 ? 1 : Math.abs(previous);
  const percentChange = ((current - previous) / denominator) * 100;

  return {
    metric,
    direction,
    current,
    previous,
    percentChange,
    dataPoints: points,
  };
}

/**
 * Compute a compounding score (0-100) from trend analyses.
 * Higher = system is improving more consistently.
 */
export function computeCompoundingScore(trends: TrendAnalysis[]): number {
  if (trends.length === 0) return 50;

  let score = 0;
  for (const trend of trends) {
    switch (trend.direction) {
      case "improving":
        score += 1;
        break;
      case "stable":
        score += 0.5;
        break;
      case "degrading":
        score += 0;
        break;
    }
  }

  // Normalize to 0-100
  return Math.round((score / trends.length) * 100);
}

// ─── Summary Generation ─────────────────────────────────────────

export async function generateMetricsSummary(
  projectRoot: string
): Promise<MetricsSummary> {
  const sessionIds = await listSessionMetrics(projectRoot);
  const sessions: SessionMetrics[] = [];

  for (const id of sessionIds) {
    const m = await loadSessionMetrics(projectRoot, id);
    if (m) sessions.push(m);
  }

  // Sort by timestamp
  sessions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Build trend data
  const completionPoints: TrendPoint[] = sessions.map((s) => ({
    session: s.session,
    value: s.tasksAttempted > 0 ? (s.tasksCompleted / s.tasksAttempted) * 100 : 0,
  }));

  const failurePoints: TrendPoint[] = sessions.map((s) => ({
    session: s.session,
    value: s.tasksFailed,
  }));

  const costPoints: TrendPoint[] = sessions.map((s) => ({
    session: s.session,
    value: s.totalCost,
  }));

  const trends: TrendAnalysis[] = [
    analyzeTrend("completion-rate", completionPoints, true),
    analyzeTrend("failure-count", failurePoints, false),
    analyzeTrend("total-cost", costPoints, false),
  ];

  return {
    sessions: sessions.length,
    latestSession: sessions.length > 0 ? sessions[sessions.length - 1]!.session : "",
    trends,
    compoundingScore: computeCompoundingScore(trends),
  };
}
