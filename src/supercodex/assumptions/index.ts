import { readTextIfExists, writeTextAtomic } from "../fs.js";
import { parseUnitId } from "../planning/index.js";
import { resolveRepoPath } from "../paths.js";

const ASSUMPTIONS_REF = "vault/assumptions.md";
const ASSUMPTIONS_TEMPLATE = `# Assumptions

Record interpretive decisions made without blocking the run.
`;

export interface AssumptionEntryParams {
  scope: string;
  assumption: string;
  timestamp?: string;
  confidence?: "low" | "medium" | "high";
  blast_radius?: "low" | "medium" | "high";
  requires_human_review?: boolean;
}

function nextAssumptionId(content: string, dateStamp: string): string {
  const regex = new RegExp(`### A-${dateStamp}-(\\d{3})`, "g");
  let max = 0;
  for (const match of content.matchAll(regex)) {
    const value = Number.parseInt(match[1] ?? "0", 10);
    if (value > max) {
      max = value;
    }
  }

  return `A-${dateStamp}-${String(max + 1).padStart(3, "0")}`;
}

function defaultBlastRadius(scope: string): "low" | "medium" | "high" {
  const parsed = parseUnitId(scope);
  if (parsed.kind === "task") {
    return "low";
  }
  if (parsed.kind === "slice") {
    return "medium";
  }
  return "high";
}

function defaultRequiresHumanReview(scope: string): boolean {
  return parseUnitId(scope).kind !== "task";
}

export function appendAssumptions(root: string, entries: AssumptionEntryParams[]): string[] {
  if (entries.length === 0) {
    return [];
  }

  const path = resolveRepoPath(root, ASSUMPTIONS_REF);
  const current = readTextIfExists(path) ?? ASSUMPTIONS_TEMPLATE;
  const additions: string[] = [];
  const ids: string[] = [];
  let working = current.trimEnd();

  for (const entry of entries) {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    const dateStamp = timestamp.slice(0, 10);
    const id = nextAssumptionId(`${working}\n${additions.join("\n")}`, dateStamp);
    ids.push(id);
    additions.push(
      [
        `### ${id}`,
        "",
        `- Timestamp: ${timestamp}`,
        `- Scope: ${entry.scope}`,
        `- Assumption: ${entry.assumption.trim()}`,
        `- Confidence: ${entry.confidence ?? "medium"}`,
        `- Blast radius: ${entry.blast_radius ?? defaultBlastRadius(entry.scope)}`,
        `- Requires later human review: ${(entry.requires_human_review ?? defaultRequiresHumanReview(entry.scope)) ? "yes" : "no"}`,
        "",
      ].join("\n"),
    );
  }

  const next = `${working}\n\n${additions.join("\n")}`.trimEnd();
  writeTextAtomic(path, `${next}\n`);
  return ids;
}

