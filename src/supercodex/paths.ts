import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT_TEMPLATE_ROOT_FILES = [
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "SUPER_CODEX.md",
] as const;

const ROOT_TEMPLATE_DIRS = ["skills", "vault", ".supercodex"] as const;

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

function listFilesRecursive(root: string, directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) {
    return [];
  }

  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(root, relativePath);
      }

      return [relativePath];
    })
    .sort();
}

export function listManagedTemplateFiles(root: string): string[] {
  const rootFiles = ROOT_TEMPLATE_ROOT_FILES.filter((relativePath) => existsSync(join(root, relativePath)));
  const directoryFiles = ROOT_TEMPLATE_DIRS.flatMap((directory) => listFilesRecursive(root, directory));
  return [...new Set([...rootFiles, ...directoryFiles])].sort();
}

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
