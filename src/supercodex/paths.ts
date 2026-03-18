import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT_TEMPLATE_FILES = [
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "SUPER_CODEX.md",
  "skills/README.md",
  "vault/index.md",
  "vault/vision.md",
  "vault/roadmap.md",
  "vault/architecture.md",
  "vault/constraints.md",
  "vault/decisions.md",
  "vault/assumptions.md",
  "vault/feedback/QUESTIONS.md",
  "vault/feedback/BLOCKERS.md",
  "vault/feedback/ANSWERS.md",
  "vault/milestones/README.md",
  "vault/milestones/M001/milestone.md",
  "vault/milestones/M001/boundary-map.md",
  "vault/milestones/M001/summary.md",
  "vault/milestones/M001/uat.md",
  "vault/milestones/M001/slices/S01/slice.md",
  "vault/milestones/M001/slices/S01/research.md",
  "vault/milestones/M001/slices/S01/plan.md",
  "vault/milestones/M001/slices/S01/review.md",
  "vault/milestones/M001/slices/S01/summary.md",
  "vault/milestones/M001/slices/S02/slice.md",
  "vault/milestones/M001/slices/S02/research.md",
  "vault/milestones/M001/slices/S02/plan.md",
  "vault/milestones/M001/slices/S02/review.md",
  "vault/milestones/M001/slices/S02/summary.md",
  "vault/milestones/M001/slices/S03/slice.md",
  "vault/milestones/M001/slices/S03/research.md",
  "vault/milestones/M001/slices/S03/plan.md",
  "vault/milestones/M001/slices/S03/review.md",
  "vault/milestones/M001/slices/S03/summary.md",
  "vault/milestones/M001/slices/S04/slice.md",
  "vault/milestones/M001/slices/S04/research.md",
  "vault/milestones/M001/slices/S04/plan.md",
  "vault/milestones/M001/slices/S04/review.md",
  "vault/milestones/M001/slices/S04/summary.md",
  "vault/milestones/M002/milestone.md",
  "vault/milestones/M002/boundary-map.md",
  "vault/milestones/M002/summary.md",
  "vault/milestones/M002/uat.md",
  "vault/milestones/M002/slices/S01/slice.md",
  "vault/milestones/M002/slices/S01/research.md",
  "vault/milestones/M002/slices/S01/plan.md",
  "vault/milestones/M002/slices/S01/review.md",
  "vault/milestones/M002/slices/S01/summary.md",
  "vault/milestones/M002/slices/S02/slice.md",
  "vault/milestones/M002/slices/S02/research.md",
  "vault/milestones/M002/slices/S02/plan.md",
  "vault/milestones/M002/slices/S02/review.md",
  "vault/milestones/M002/slices/S02/summary.md",
  "vault/milestones/M002/slices/S03/slice.md",
  "vault/milestones/M002/slices/S03/research.md",
  "vault/milestones/M002/slices/S03/plan.md",
  "vault/milestones/M002/slices/S03/review.md",
  "vault/milestones/M002/slices/S03/summary.md",
  "vault/milestones/M002/slices/S04/slice.md",
  "vault/milestones/M002/slices/S04/research.md",
  "vault/milestones/M002/slices/S04/plan.md",
  "vault/milestones/M002/slices/S04/review.md",
  "vault/milestones/M002/slices/S04/summary.md",
  "vault/onboarding/README.md",
  "vault/patterns/README.md",
  ".supercodex/runtime/adapters.json",
  ".supercodex/runtime/policies.json",
  ".supercodex/runtime/routing.json",
  ".supercodex/prompts/dispatch.json",
  ".supercodex/prompts/next-action.md",
  ".supercodex/state/current.json",
  ".supercodex/state/queue.json",
  ".supercodex/state/transitions.jsonl",
  ".supercodex/runs/README.md",
  ".supercodex/audits/README.md",
  ".supercodex/metrics/README.md",
  ".supercodex/temp/README.md",
  ".supercodex/schemas/README.md",
  ".supercodex/schemas/current.schema.json",
  ".supercodex/schemas/queue.schema.json",
  ".supercodex/schemas/lock.schema.json",
  ".supercodex/schemas/transition.schema.json",
  ".supercodex/schemas/dispatch.schema.json",
  ".supercodex/schemas/result.schema.json",
  ".supercodex/schemas/probe.schema.json",
  ".supercodex/schemas/runtime-registry.schema.json",
  ".supercodex/schemas/runtime-handle.schema.json",
] as const;

export const PLACEHOLDER_CHECKS: Record<string, RegExp[]> = {
  "vault/vision.md": [/Describe the real-world outcome/i, /Observable outcome 1/i],
  "vault/roadmap.md": [/No milestones defined yet/i, /placeholder/i, /Replace placeholders/i],
  "vault/index.md": [/seeded scaffold/i, /Phase 0 notes/i],
  "vault/architecture.md": [/Use this document for durable architectural structure/i],
  "vault/constraints.md": [/Record the hard constraints/i],
  "vault/decisions.md": [/Decision Template/i],
  "vault/assumptions.md": [/Assumption Template/i],
  "vault/milestones/README.md": [/Phase 0 does not create placeholder milestone trees/i],
  ".supercodex/state/current.json": [/"active_milestone": null/, /"phase": "intake"/],
  ".supercodex/state/queue.json": [/"items": \[\]/],
};

export const CURRENT_STATE_PATH = ".supercodex/state/current.json";
export const QUEUE_STATE_PATH = ".supercodex/state/queue.json";
export const TRANSITIONS_PATH = ".supercodex/state/transitions.jsonl";
export const LOCKS_DIR = ".supercodex/state/locks";
export const SCHEMAS_DIR = ".supercodex/schemas";

export function findPackageRoot(startPath: string): string {
  let current = dirname(startPath);

  while (current !== dirname(current)) {
    const hasSpec = existsSync(join(current, "SUPER_CODEX.md"));
    const hasAgents = existsSync(join(current, "AGENTS.md"));
    if (hasSpec && hasAgents) {
      return current;
    }

    current = dirname(current);
  }

  throw new Error("Unable to locate SUPER_CODEX package root.");
}

export function resolveRepoPath(root: string, relativePath: string): string {
  return join(root, relativePath);
}

export function isPlaceholderContent(relativePath: string, content: string): boolean {
  const patterns = PLACEHOLDER_CHECKS[relativePath];
  return patterns ? patterns.some((pattern) => pattern.test(content)) : false;
}
