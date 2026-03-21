/**
 * SUPER_CLAUDE — Cost Tracking
 * Tracks token usage and estimated costs per phase.
 * Per spec §16: Budget tracking with per-phase breakdown.
 */

import type { CostEntry, Phase } from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Cost Tracker ───────────────────────────────────────────────

export interface CostTracker {
  session: string;
  entries: CostEntry[];
  totalCost: number;
}

// ─── Pricing (per model) ────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  opus:   { input: 15 / 1_000_000, output: 75 / 1_000_000 },  // $15/$75 per 1M tokens
  sonnet: { input: 3 / 1_000_000,  output: 15 / 1_000_000 },  // $3/$15 per 1M tokens
  haiku:  { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },  // $0.80/$4 per 1M tokens
};

/**
 * Estimate cost from token counts using model-specific pricing.
 * Defaults to opus pricing when model is unknown (conservative estimate).
 */
export function estimateCost(tokensIn: number, tokensOut: number, model: string = "opus"): number {
  const prices = PRICING[model] ?? PRICING["opus"]!;
  return tokensIn * prices.input + tokensOut * prices.output;
}

// ─── Tracker Operations ─────────────────────────────────────────

/**
 * Create a new cost tracker for a session.
 */
export function createCostTracker(session: string): CostTracker {
  return {
    session,
    entries: [],
    totalCost: 0,
  };
}

/**
 * Record a cost entry and return updated tracker.
 * Immutable — returns a new tracker.
 */
export function recordCostEntry(tracker: CostTracker, entry: CostEntry): CostTracker {
  const entries = [...tracker.entries, entry];
  const totalCost = entries.reduce((sum, e) => sum + e.estimatedCost, 0);
  return { ...tracker, entries, totalCost };
}

/**
 * Get the total accumulated cost.
 */
export function getTotalCost(tracker: CostTracker): number {
  return tracker.totalCost;
}

/**
 * Get cost grouped by phase.
 */
export function getCostByPhase(tracker: CostTracker): Record<string, number> {
  const byPhase: Record<string, number> = {};

  for (const entry of tracker.entries) {
    const current = byPhase[entry.phase] ?? 0;
    byPhase[entry.phase] = current + entry.estimatedCost;
  }

  return byPhase;
}

/**
 * Check if the budget ceiling has been exceeded.
 */
export function isBudgetExceeded(tracker: CostTracker, budgetCeiling: number): boolean {
  return tracker.totalCost >= budgetCeiling;
}

// ─── Persistence ─────────────────────────────────────────────────

/**
 * Write cost tracker to disk as markdown (spec §16.3 format).
 */
export async function writeCostTracker(
  projectRoot: string,
  tracker: CostTracker
): Promise<void> {
  const dir = `${projectRoot}/${PATHS.history}/metrics`;
  await Bun.$`mkdir -p ${dir}`.quiet();

  const byPhase = getCostByPhase(tracker);

  let md = `---\nsession: ${tracker.session}\n---\n\n`;
  md += `| Phase | Tokens In | Tokens Out | Estimated Cost |\n`;
  md += `|---|---|---|---|\n`;

  for (const entry of tracker.entries) {
    md += `| ${entry.phase} | ${entry.tokensIn.toLocaleString()} | ${entry.tokensOut.toLocaleString()} | $${entry.estimatedCost.toFixed(2)} |\n`;
  }

  md += `| **Total** | **${tracker.entries.reduce((s, e) => s + e.tokensIn, 0).toLocaleString()}** | **${tracker.entries.reduce((s, e) => s + e.tokensOut, 0).toLocaleString()}** | **$${tracker.totalCost.toFixed(2)}** |\n`;

  await Bun.write(`${dir}/cost-tracker-${tracker.session}.md`, md);
}
