/**
 * SUPER_CLAUDE — PLAN.md Parser
 * Extracts structured TaskPlan data from markdown task plans.
 *
 * Parses frontmatter, goal, steps, must-haves (truths, artifacts, key links),
 * must-not-haves, and TDD sequence from a PLAN.md file.
 */

import type { TaskPlan, TaskStatus, ArtifactSpec, MustHaves, TDDSequence } from "./types.ts";

// ─── Placeholder patterns (skip these) ──────────────────────────

const PLACEHOLDER_RE = /^_.*_$|^_?TBD_?$/i;

function isPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text.trim());
}

// ─── Frontmatter Parsing ─────────────────────────────────────────

interface Frontmatter {
  task: string;
  slice: string;
  milestone: string;
  status: TaskStatus;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!fmMatch?.[1]) {
    return {
      frontmatter: { task: "", slice: "", milestone: "", status: "pending" },
      body: content,
    };
  }

  const yaml = fmMatch[1];
  const body = fmMatch[2] ?? "";

  const get = (key: string): string => {
    const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match?.[1]?.trim() ?? "";
  };

  return {
    frontmatter: {
      task: get("task"),
      slice: get("slice"),
      milestone: get("milestone"),
      status: (get("status") || "pending") as TaskStatus,
    },
    body,
  };
}

// ─── Section Extraction ──────────────────────────────────────────

/**
 * Extract content between a heading and the next heading of same or higher level.
 * For `## Goal`, returns text until the next `## ` or end of string.
 * For `### Truths`, returns text until the next `### ` or `## ` or end.
 */
function extractSection(body: string, heading: string, level: number): string {
  // Build pattern: match the heading, capture until next heading of same/higher level
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hashes = "#".repeat(level);
  const headingPattern = new RegExp(
    `^${hashes}\\s+${escapedHeading}\\s*$`,
    "m"
  );

  const match = headingPattern.exec(body);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = body.slice(start);

  // Find next heading of same or higher level
  const nextHeadingPattern = new RegExp(`^#{1,${level}}\\s+`, "m");
  const nextMatch = nextHeadingPattern.exec(rest);

  const sectionContent = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return sectionContent.trim();
}

// ─── Bullet List Parsing ─────────────────────────────────────────

function parseBulletList(section: string): string[] {
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !isPlaceholder(line));
}

// ─── Ordered List Parsing ────────────────────────────────────────

function parseOrderedList(section: string): string[] {
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0 && !isPlaceholder(line));
}

// ─── Artifact Parsing ────────────────────────────────────────────

/**
 * Parse an artifact line like:
 *   `src/auth.ts — JWT authentication module (30+ lines) [exports: generateToken, verifyToken]`
 *
 * Supported formats:
 *   `path — description (N+ lines) [exports: a, b]`
 *   `path — description [exports: a]`
 *   `path — description (N+ lines)`
 *   `path — description`
 */
function parseArtifactLine(line: string): ArtifactSpec | null {
  // Split on em-dash or double hyphen
  const dashMatch = line.match(/^(\S+)\s+[—\u2014-]{1,2}\s+(.+)$/);
  if (!dashMatch?.[1] || !dashMatch[2]) return null;

  const path = dashMatch[1];
  let rest = dashMatch[2];

  // Extract [exports: ...] if present
  let requiredExports: string[] = [];
  const exportsMatch = rest.match(/\[exports?:\s*([^\]]+)\]/i);
  if (exportsMatch?.[1]) {
    requiredExports = exportsMatch[1].split(",").map((e) => e.trim()).filter(Boolean);
    rest = rest.replace(exportsMatch[0], "").trim();
  }

  // Extract (N+ lines) if present
  let minLines = 0;
  const linesMatch = rest.match(/\((\d+)\+?\s*lines?\)/i);
  if (linesMatch?.[1]) {
    minLines = parseInt(linesMatch[1], 10);
    rest = rest.replace(linesMatch[0], "").trim();
  }

  const description = rest.trim();

  return { path, description, minLines, requiredExports };
}

function parseArtifacts(section: string): ArtifactSpec[] {
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0 && !isPlaceholder(line))
    .map(parseArtifactLine)
    .filter((a): a is ArtifactSpec => a !== null);
}

// ─── TDD Sequence Parsing ────────────────────────────────────────

function parseTDDSequence(section: string): TDDSequence {
  const result: TDDSequence = {
    testFiles: [],
    testCases: [],
    implementationFiles: [],
  };

  if (!section) return result;

  for (const line of section.split("\n")) {
    const stripped = line.replace(/^\s*[-*]\s+/, "").trim();
    if (!stripped || isPlaceholder(stripped)) continue;

    // Test file(s) to create: file1, file2
    const testFilesMatch = stripped.match(/^Test\s+file\(?s?\)?[^:]*:\s*(.+)$/i);
    if (testFilesMatch?.[1] && !isPlaceholder(testFilesMatch[1].trim())) {
      result.testFiles = testFilesMatch[1]
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      continue;
    }

    // Test cases to write first: case1, case2
    const testCasesMatch = stripped.match(/^Test\s+cases?[^:]*:\s*(.+)$/i);
    if (testCasesMatch?.[1] && !isPlaceholder(testCasesMatch[1].trim())) {
      result.testCases = testCasesMatch[1]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      continue;
    }

    // Implementation file(s): file1, file2
    const implMatch = stripped.match(/^Implementation\s+file\(?s?\)?[^:]*:\s*(.+)$/i);
    if (implMatch?.[1] && !isPlaceholder(implMatch[1].trim())) {
      result.implementationFiles = implMatch[1]
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      continue;
    }
  }

  return result;
}

// ─── Main Parser ─────────────────────────────────────────────────

export function parseTaskPlan(content: string): TaskPlan {
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract sections
  const goalSection = extractSection(body, "Goal", 2);
  const stepsSection = extractSection(body, "Steps", 2);
  const truthsSection = extractSection(body, "Truths", 3);
  const artifactsSection = extractSection(body, "Artifacts", 3);
  const keyLinksSection = extractSection(body, "Key Links", 3);
  const mustNotHavesSection = extractSection(body, "Must-NOT-Haves", 2);
  const tddSection = extractSection(body, "TDD Sequence", 2);

  return {
    task: frontmatter.task,
    slice: frontmatter.slice,
    milestone: frontmatter.milestone,
    status: frontmatter.status,
    goal: goalSection.split("\n")[0]?.trim() ?? "",
    steps: parseOrderedList(stepsSection),
    mustHaves: {
      truths: parseBulletList(truthsSection),
      artifacts: parseArtifacts(artifactsSection),
      keyLinks: parseBulletList(keyLinksSection),
    },
    mustNotHaves: parseBulletList(mustNotHavesSection),
    tddSequence: parseTDDSequence(tddSection),
  };
}
