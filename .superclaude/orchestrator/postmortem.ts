/**
 * SUPER_CLAUDE — Postmortem Protocol
 * Creates, persists, and manages postmortem reports.
 * Per spec §12.3: Trace failures to system causes, propose fixes.
 */

import type {
  PostmortemReport,
  PostmortemFailure,
  PostmortemRootCause,
  PostmortemFix,
  PostmortemSeverity,
} from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Types ──────────────────────────────────────────────────────

interface CreatePostmortemInput {
  id: string;
  session: string;
  failure: PostmortemFailure;
  rootCause: PostmortemRootCause;
  proposedFixes: PostmortemFix[];
  severity: PostmortemSeverity;
}

// ─── Create ─────────────────────────────────────────────────────

export function createPostmortem(input: CreatePostmortemInput): PostmortemReport {
  return {
    id: input.id,
    timestamp: new Date().toISOString(),
    session: input.session,
    failure: input.failure,
    rootCause: input.rootCause,
    proposedFixes: input.proposedFixes,
    severity: input.severity,
    status: "proposed",
  };
}

// ─── Markdown Generation ────────────────────────────────────────

export function generatePostmortemMarkdown(pm: PostmortemReport): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`id: ${pm.id}`);
  lines.push(`session: ${pm.session}`);
  lines.push(`timestamp: ${pm.timestamp}`);
  lines.push(`status: ${pm.status}`);
  lines.push("---");
  lines.push("");

  // Failure section
  lines.push("## Failure");
  lines.push(`- **What went wrong:** ${pm.failure.what}`);
  lines.push(`- **When:** ${pm.failure.when}`);
  lines.push(`- **Impact:** ${pm.failure.impact}`);
  lines.push("");

  // Root cause
  lines.push("## Root Cause Analysis");
  lines.push(`- **Context present:** ${pm.rootCause.contextPresent.length > 0 ? pm.rootCause.contextPresent.join(", ") : "none"}`);
  lines.push(`- **Context missing:** ${pm.rootCause.contextMissing.length > 0 ? pm.rootCause.contextMissing.join(", ") : "none"}`);
  lines.push(`- **Unclear doc:** ${pm.rootCause.unclearDoc ?? "none"}`);
  lines.push(`- **Ambiguous skill:** ${pm.rootCause.ambiguousSkill ?? "none"}`);
  lines.push(`- **Missing test:** ${pm.rootCause.missingTest ?? "none"}`);
  lines.push(`- **Missing verification:** ${pm.rootCause.missingVerification ?? "none"}`);
  lines.push("");

  // Proposed fixes
  lines.push("## Proposed System Fixes");
  if (pm.proposedFixes.length === 0) {
    lines.push("_None proposed_");
  } else {
    for (const fix of pm.proposedFixes) {
      lines.push(`### ${fix.type}: ${fix.target}`);
      lines.push(`**Description:** ${fix.description}`);
      if (fix.before) lines.push(`**Before:** ${fix.before}`);
      if (fix.after) lines.push(`**After:** ${fix.after}`);
      lines.push(`**Reason:** ${fix.reason}`);
      lines.push("");
    }
  }
  lines.push("");

  // Severity
  lines.push("## Priority");
  lines.push(`- **Frequency:** ${pm.severity.frequency}`);
  lines.push(`- **Impact:** ${pm.severity.impact}`);
  lines.push(`- **Fix effort:** ${pm.severity.effort}`);
  lines.push(`- **Recommendation:** ${pm.severity.recommendation}`);
  lines.push("");

  return lines.join("\n");
}

// ─── Persistence ────────────────────────────────────────────────

function postmortemDir(projectRoot: string): string {
  return `${projectRoot}/${PATHS.history}/postmortems`;
}

function postmortemJsonPath(projectRoot: string, id: string): string {
  return `${postmortemDir(projectRoot)}/${id}.json`;
}

function postmortemMdPath(projectRoot: string, id: string): string {
  return `${postmortemDir(projectRoot)}/${id}.md`;
}

export async function writePostmortem(
  projectRoot: string,
  pm: PostmortemReport
): Promise<void> {
  const dir = postmortemDir(projectRoot);
  await Bun.$`mkdir -p ${dir}`.quiet();

  // Write JSON for data fidelity, markdown for human readability
  await Bun.write(postmortemJsonPath(projectRoot, pm.id), JSON.stringify(pm, null, 2));
  await Bun.write(postmortemMdPath(projectRoot, pm.id), generatePostmortemMarkdown(pm));
}

export async function loadPostmortem(
  projectRoot: string,
  id: string
): Promise<PostmortemReport | null> {
  const jsonPath = postmortemJsonPath(projectRoot, id);
  const file = Bun.file(jsonPath);

  if (!(await file.exists())) return null;

  const content = await file.text();
  return JSON.parse(content) as PostmortemReport;
}

export async function listPostmortems(projectRoot: string): Promise<string[]> {
  const dir = postmortemDir(projectRoot);
  const glob = new Bun.Glob("PM-*.json");
  const ids: string[] = [];

  for await (const entry of glob.scan({ cwd: dir })) {
    ids.push(entry.replace(".json", ""));
  }

  return ids.sort();
}

export async function updatePostmortemStatus(
  projectRoot: string,
  id: string,
  status: PostmortemReport["status"]
): Promise<void> {
  const pm = await loadPostmortem(projectRoot, id);
  if (!pm) return;

  pm.status = status;
  await writePostmortem(projectRoot, pm);
}

export async function nextPostmortemId(projectRoot: string): Promise<string> {
  const existing = await listPostmortems(projectRoot);

  if (existing.length === 0) return "PM-001";

  const numbers = existing
    .map((id) => parseInt(id.replace("PM-", ""), 10))
    .filter((n) => !isNaN(n));

  const max = Math.max(...numbers);
  return `PM-${String(max + 1).padStart(3, "0")}`;
}

// ─── Parsing ────────────────────────────────────────────────────

function parsePostmortemMarkdown(content: string, id: string): PostmortemReport {
  const pm: PostmortemReport = {
    id,
    timestamp: "",
    session: "",
    failure: { what: "", when: "", impact: "" },
    rootCause: {
      contextPresent: [],
      contextMissing: [],
      unclearDoc: null,
      ambiguousSkill: null,
      missingTest: null,
      missingVerification: null,
    },
    proposedFixes: [],
    severity: {
      frequency: "rare",
      impact: "minor",
      effort: "trivial",
      recommendation: "defer",
    },
    status: "proposed",
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
        case "id":
          pm.id = value;
          break;
        case "session":
          pm.session = value;
          break;
        case "timestamp":
          pm.timestamp = value;
          break;
        case "status":
          pm.status = value as PostmortemReport["status"];
          break;
      }
    }
  }

  // Parse failure section
  const failureMatch = content.match(/## Failure\n([\s\S]*?)(?=\n## )/);
  if (failureMatch?.[1]) {
    const section = failureMatch[1];
    pm.failure.what = extractBoldField(section, "What went wrong");
    pm.failure.when = extractBoldField(section, "When");
    pm.failure.impact = extractBoldField(section, "Impact");
  }

  // Parse root cause
  const rcMatch = content.match(/## Root Cause Analysis\n([\s\S]*?)(?=\n## )/);
  if (rcMatch?.[1]) {
    const section = rcMatch[1];
    const present = extractBoldField(section, "Context present");
    pm.rootCause.contextPresent = present && present !== "none" ? present.split(", ") : [];
    const missing = extractBoldField(section, "Context missing");
    pm.rootCause.contextMissing = missing && missing !== "none" ? missing.split(", ") : [];
    const unclearDoc = extractBoldField(section, "Unclear doc");
    pm.rootCause.unclearDoc = unclearDoc && unclearDoc !== "none" ? unclearDoc : null;
    const ambiguousSkill = extractBoldField(section, "Ambiguous skill");
    pm.rootCause.ambiguousSkill = ambiguousSkill && ambiguousSkill !== "none" ? ambiguousSkill : null;
    const missingTest = extractBoldField(section, "Missing test");
    pm.rootCause.missingTest = missingTest && missingTest !== "none" ? missingTest : null;
    const missingVerification = extractBoldField(section, "Missing verification");
    pm.rootCause.missingVerification = missingVerification && missingVerification !== "none" ? missingVerification : null;
  }

  // Parse severity
  const sevMatch = content.match(/## Priority\n([\s\S]*?)$/);
  if (sevMatch?.[1]) {
    const section = sevMatch[1];
    const freq = extractBoldField(section, "Frequency");
    if (freq) pm.severity.frequency = freq as PostmortemReport["severity"]["frequency"];
    const impact = extractBoldField(section, "Impact");
    if (impact) pm.severity.impact = impact as PostmortemReport["severity"]["impact"];
    const effort = extractBoldField(section, "Fix effort");
    if (effort) pm.severity.effort = effort as PostmortemReport["severity"]["effort"];
    const rec = extractBoldField(section, "Recommendation");
    if (rec) pm.severity.recommendation = rec as PostmortemReport["severity"]["recommendation"];
  }

  return pm;
}

function extractBoldField(section: string, label: string): string {
  const regex = new RegExp(`\\*\\*${escapeRegex(label)}:\\*\\*\\s*(.+)`);
  const match = section.match(regex);
  return match?.[1]?.trim() ?? "";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
