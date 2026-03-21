/**
 * SUPER_CLAUDE — Scaffolding
 * Creates directory structures and template files for milestones, slices, and tasks.
 */

import { PATHS } from "./types.ts";

// ─── Milestone Scaffold ─────────────────────────────────────────

export async function scaffoldMilestone(
  projectRoot: string,
  milestoneId: string,
  description: string
): Promise<void> {
  const base = `${projectRoot}/${PATHS.milestonePath(milestoneId)}`;

  await Bun.$`mkdir -p ${base}/slices`;

  // ROADMAP.md placeholder (will be filled by PLAN_MILESTONE phase)
  await Bun.write(
    `${base}/ROADMAP.md`,
    `---
milestone: ${milestoneId}
status: pending
description: ${description}
---

## Slices

_To be planned during PLAN_MILESTONE phase._
`
  );

  // CONTEXT.md placeholder
  await Bun.write(
    `${base}/CONTEXT.md`,
    `---
milestone: ${milestoneId}
created: ${new Date().toISOString()}
---

## Decisions

_To be filled during DISCUSS phase._
`
  );
}

// ─── Slice Scaffold ─────────────────────────────────────────────

export async function scaffoldSlice(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  demoSentence: string
): Promise<void> {
  const base = `${projectRoot}/${PATHS.slicePath(milestoneId, sliceId)}`;

  await Bun.$`mkdir -p ${base}/tasks`;

  // PLAN.md placeholder
  await Bun.write(
    `${base}/PLAN.md`,
    `---
slice: ${sliceId}
milestone: ${milestoneId}
status: pending
demo_sentence: "${demoSentence}"
---

## Tasks

_To be planned during PLAN_SLICE phase._
`
  );
}

// ─── Task Scaffold ──────────────────────────────────────────────

/**
 * Extract a task's full section from the slice PLAN.md.
 * Captures from "### T01:" heading until the next task heading, section heading, or separator.
 */
function extractTaskSection(slicePlanContent: string, taskId: string): string | null {
  const headingPrefix = `### ${taskId}`;
  const startIdx = slicePlanContent.indexOf(headingPrefix);
  if (startIdx === -1) return null;

  // Find end: next ### T heading, next ## heading, or --- separator
  const afterHeading = slicePlanContent.slice(startIdx);
  const headingLineEnd = afterHeading.indexOf("\n");
  if (headingLineEnd === -1) return null;

  const body = afterHeading.slice(headingLineEnd + 1);

  // Skip inline task frontmatter (---\n...\n---\n) if present.
  // The architect may embed strategy/complexity metadata in a YAML-like block
  // that uses --- delimiters. We must not treat the closing --- as a section boundary.
  let boundarySearchStart = 0;
  if (body.startsWith("---")) {
    const closingIdx = body.indexOf("\n---", 3);
    if (closingIdx !== -1) {
      const afterClose = body.indexOf("\n", closingIdx + 4);
      boundarySearchStart = afterClose !== -1 ? afterClose + 1 : closingIdx + 4;
    }
  }

  // Search for end boundary AFTER any inline frontmatter
  const searchRegion = body.slice(boundarySearchStart);
  const nextTaskMatch = searchRegion.match(/\n### T\d{2}/);
  const nextSectionMatch = searchRegion.match(/\n## [^#]/);
  const nextSeparatorMatch = searchRegion.match(/\n---\s*$/m);

  const boundaries = [
    nextTaskMatch?.index ?? Infinity,
    nextSectionMatch?.index ?? Infinity,
    nextSeparatorMatch?.index ?? Infinity,
  ];
  const endIdx = Math.min(...boundaries);

  // Map back to the full body (offset by the frontmatter we skipped)
  const actualEnd = endIdx === Infinity ? Infinity : endIdx + boundarySearchStart;
  const taskBody = actualEnd === Infinity ? body.trim() : body.slice(0, actualEnd).trim();

  // Extract goal from heading line
  const headingLine = afterHeading.slice(0, headingLineEnd);
  const goalText = headingLine
    .replace(/^###\s*T\d+\s*[:—\-]?\s*/, "")
    .replace(/\*\*/g, "")
    .trim();

  return `## Goal\n${goalText}\n\n${taskBody}`;
}

export async function scaffoldTask(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
  goal: string
): Promise<void> {
  const base = `${projectRoot}/${PATHS.taskPath(milestoneId, sliceId, taskId)}`;
  await Bun.$`mkdir -p ${base}`;

  // Try to extract the detailed task section from the slice PLAN.md
  const slicePlanPath = `${projectRoot}/${PATHS.slicePath(milestoneId, sliceId)}/PLAN.md`;
  const slicePlanFile = Bun.file(slicePlanPath);
  let taskBody = "";

  if (await slicePlanFile.exists()) {
    const slicePlan = await slicePlanFile.text();
    const section = extractTaskSection(slicePlan, taskId);
    if (section) {
      taskBody = section;
    }
  }

  // Fallback to minimal template if extraction failed
  if (!taskBody) {
    taskBody = `## Goal\n${goal}\n\n## TDD Sequence\n- _TBD_\n\n## Must-Haves\n- _To be defined_`;
  }

  const content = [
    "---",
    `task: ${taskId}`,
    `slice: ${sliceId}`,
    `milestone: ${milestoneId}`,
    "status: pending",
    "---",
    "",
    taskBody,
    "",
  ].join("\n");

  await Bun.write(`${base}/PLAN.md`, content);
}

// ─── Write Continue-Here ────────────────────────────────────────

export async function writeContinueHere(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
  data: {
    interruptedAt: string;
    whatsDone: string[];
    whatRemains: string[];
    decisionsMade: string[];
    watchOutFor: string[];
    firstThingToDo: string;
  }
): Promise<void> {
  const base = `${projectRoot}/${PATHS.taskPath(milestoneId, sliceId, taskId)}`;

  const content = `---
task: ${taskId}
interrupted_at: ${data.interruptedAt}
---

## What's Done
${data.whatsDone.map((d) => `- ${d}`).join("\n")}

## What Remains
${data.whatRemains.map((r) => `- ${r}`).join("\n")}

## Decisions Made
${data.decisionsMade.map((d) => `- ${d}`).join("\n")}

## Watch Out For
${data.watchOutFor.map((w) => `- ${w}`).join("\n")}

## First Thing To Do
- ${data.firstThingToDo}
`;

  await Bun.write(`${base}/CONTINUE.md`, content);
}

// ─── Write Review Feedback ──────────────────────────────────────

export async function writeReviewFeedback(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
  issues: string[],
  attempt: number
): Promise<void> {
  const base = `${projectRoot}/${PATHS.taskPath(milestoneId, sliceId, taskId)}`;

  const content = `---
task: ${taskId}
review_attempt: ${attempt}
timestamp: ${new Date().toISOString()}
---

## MUST-FIX Issues From Review

The following issues were found by the reviewer quality gate and MUST be fixed:

${issues.map((issue) => `- ${issue}`).join("\n")}

## Instructions

Fix ALL issues listed above. Do not add new features — only address the reviewer findings.
After fixing, ensure all tests still pass.
`;

  await Bun.write(`${base}/REVIEW_FEEDBACK.md`, content);
}

/**
 * Read the review attempt count from REVIEW_FEEDBACK.md on disk.
 * Returns 0 if the file doesn't exist (no prior review attempts).
 */
export async function readReviewAttemptCount(
  projectRoot: string,
  milestone: string,
  slice: string,
  task: string
): Promise<number> {
  const path = `${projectRoot}/${PATHS.taskPath(milestone, slice, task)}/REVIEW_FEEDBACK.md`;
  const file = Bun.file(path);
  if (!(await file.exists())) return 0;

  const content = await file.text();
  const match = content.match(/review_attempt:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function clearReviewFeedback(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  taskId: string
): Promise<void> {
  const path = `${projectRoot}/${PATHS.taskPath(milestoneId, sliceId, taskId)}/REVIEW_FEEDBACK.md`;
  try {
    await Bun.$`rm -f ${path}`.quiet();
  } catch {
    // File may not exist
  }
}

// ─── Vault Index ────────────────────────────────────────────────

export async function initializeVault(projectRoot: string): Promise<void> {
  const vaultBase = `${projectRoot}/${PATHS.vault}`;

  await Bun.write(
    `${vaultBase}/INDEX.md`,
    `---
title: Vault Index
type: index
updated: ${new Date().toISOString()}
---

# Doc Vault — Map of Content

## Architecture
- _No docs yet — will be populated as the project develops_

## Patterns
- _No docs yet_

## Decisions
- _No ADRs yet_

## Learnings
- _No learnings yet_

## Playbooks
- _No playbooks yet_

## Contracts
- _No contracts yet_

## Testing
- _No testing docs yet_
`
  );
}

// ─── Initialize Project State ───────────────────────────────────

export async function initializeProject(
  projectRoot: string,
  projectName: string,
  description: string
): Promise<void> {
  const statePath = `${projectRoot}/${PATHS.state}`;

  await Bun.write(
    `${statePath}/PROJECT.md`,
    `---
name: ${projectName}
created: ${new Date().toISOString()}
---

## Description
${description}

## Stack
- Runtime: Bun
- Language: TypeScript
- Testing: bun test

## Milestones
_None planned yet._
`
  );

  await Bun.write(
    `${statePath}/DECISIONS.md`,
    `---
title: Decision Register
updated: ${new Date().toISOString()}
---

# Decision Register

_No decisions recorded yet._
`
  );

  await initializeVault(projectRoot);
}
