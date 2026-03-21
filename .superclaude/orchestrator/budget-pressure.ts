/**
 * SUPER_CLAUDE — Budget Pressure System
 * Graduated cost controls that reduce token usage as budget is consumed.
 * Per spec §16: Cost-consciousness as a design constraint.
 *
 * Tiers:
 *   GREEN  (0-50%):  Full features — all phases, full review, rich context
 *   YELLOW (50-75%): Moderate — skip research for simple tasks, single-pass review
 *   ORANGE (75-90%): Lean — skip research/refactor, minimal review, compressed context
 *   RED    (90%+):   Emergency — execute only, no review, minimal context
 */

export type PressureTier = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface BudgetPressureConfig {
  /** Current cost in dollars */
  currentCost: number;
  /** Budget ceiling in dollars */
  budgetCeiling: number;
}

export interface PressurePolicy {
  tier: PressureTier;
  /** Percentage of budget consumed (0-100) */
  percentUsed: number;
  /** Whether to include RESEARCH phase */
  allowResearch: boolean;
  /** Whether to run reviewer personas */
  allowReview: boolean;
  /** How many reviewer personas to run (0-6) */
  reviewPersonaCount: number;
  /** Context budget multiplier (1.0 = full, 0.5 = half) */
  contextBudgetMultiplier: number;
  /** Whether to allow DISCUSS phase for new milestones */
  allowDiscuss: boolean;
  /** Whether to allow RETROSPECTIVE phase between slices */
  allowRetrospective: boolean;
  /** Whether to allow REASSESS phase between slices */
  allowReassess: boolean;
  /** Human-readable description of the tier */
  description: string;
}

/**
 * Compute the current budget pressure tier and its policy.
 */
export function computePressure(config: BudgetPressureConfig): PressurePolicy {
  const { currentCost, budgetCeiling } = config;

  if (budgetCeiling <= 0) {
    return makePolicy("GREEN", 0);
  }

  const percentUsed = (currentCost / budgetCeiling) * 100;

  if (percentUsed >= 90) {
    return makePolicy("RED", percentUsed);
  }
  if (percentUsed >= 75) {
    return makePolicy("ORANGE", percentUsed);
  }
  if (percentUsed >= 50) {
    return makePolicy("YELLOW", percentUsed);
  }
  return makePolicy("GREEN", percentUsed);
}

function makePolicy(tier: PressureTier, percentUsed: number): PressurePolicy {
  switch (tier) {
    case "GREEN":
      return {
        tier: "GREEN",
        percentUsed,
        allowResearch: true,
        allowReview: true,
        reviewPersonaCount: 6,
        contextBudgetMultiplier: 1.0,
        allowDiscuss: true,
        allowRetrospective: true,
        allowReassess: true,
        description: "Full budget — all features enabled",
      };

    case "YELLOW":
      return {
        tier: "YELLOW",
        percentUsed,
        allowResearch: true,
        allowReview: true,
        reviewPersonaCount: 3,
        contextBudgetMultiplier: 0.85,
        allowDiscuss: true,
        allowRetrospective: true,
        allowReassess: true,
        description: "Moderate pressure — reduced review personas, slightly compressed context",
      };

    case "ORANGE":
      return {
        tier: "ORANGE",
        percentUsed,
        allowResearch: false,
        allowReview: true,
        reviewPersonaCount: 1,
        contextBudgetMultiplier: 0.65,
        allowDiscuss: false,
        allowRetrospective: false,
        allowReassess: false,
        description: "High pressure — skip research/discuss, minimal review, compressed context",
      };

    case "RED":
      return {
        tier: "RED",
        percentUsed,
        allowResearch: false,
        allowReview: false,
        reviewPersonaCount: 0,
        contextBudgetMultiplier: 0.5,
        allowDiscuss: false,
        allowRetrospective: false,
        allowReassess: false,
        description: "Critical — execute only, no review, minimal context",
      };
  }
}

/**
 * Check if a specific phase should be skipped given current budget pressure.
 */
export function shouldSkipPhase(
  phase: string,
  policy: PressurePolicy
): boolean {
  switch (phase) {
    case "DISCUSS":
      return !policy.allowDiscuss;
    case "RESEARCH":
      return !policy.allowResearch;
    case "RETROSPECTIVE":
      return !policy.allowRetrospective;
    case "REASSESS":
      return !policy.allowReassess;
    default:
      return false;
  }
}

/**
 * Get the effective context budget (in tokens) after applying pressure multiplier.
 */
export function getEffectiveContextBudget(
  baseBudget: number,
  policy: PressurePolicy
): number {
  return Math.ceil(baseBudget * policy.contextBudgetMultiplier);
}

/**
 * Format the current pressure status for console output.
 */
export function formatPressureStatus(policy: PressurePolicy): string {
  const indicator = {
    GREEN: "🟢",
    YELLOW: "🟡",
    ORANGE: "🟠",
    RED: "🔴",
  }[policy.tier];

  return `${indicator} Budget: ${policy.percentUsed.toFixed(1)}% used [${policy.tier}] — ${policy.description}`;
}
