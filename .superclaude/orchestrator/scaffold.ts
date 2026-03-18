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

export async function scaffoldTask(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
  goal: string
): Promise<void> {
  const base = `${projectRoot}/${PATHS.taskPath(milestoneId, sliceId, taskId)}`;

  await Bun.$`mkdir -p ${base}`;

  await Bun.write(
    `${base}/PLAN.md`,
    `---
task: ${taskId}
slice: ${sliceId}
milestone: ${milestoneId}
status: pending
---

## Goal
${goal}

## Context
_Injected by orchestrator at execution time._

## Steps
1. [RED] Write failing tests
2. [GREEN] Implement to make tests pass
3. [REFACTOR] Clean up implementation
4. [VERIFY] Run full test suite, type-check, lint

## Must-Haves
### Truths
- _To be defined_

### Artifacts
- _To be defined_

### Key Links
- _To be defined_

## Must-NOT-Haves
- _To be defined_

## TDD Sequence
- Test file(s) to create: _TBD_
- Test cases to write first: _TBD_
- Implementation file(s): _TBD_
`
  );
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
