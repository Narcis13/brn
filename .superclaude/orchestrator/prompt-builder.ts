/**
 * SUPER_CLAUDE — Prompt Builder
 * Generates phase-specific prompts for Claude headless invocations.
 */

import type { ContextPayload, Phase, ProjectState, TDDSubPhase } from "./types.ts";
import { PATHS } from "./types.ts";

// ─── Prompt Builder ──────────────────────────────────────────────

export function buildPrompt(
  state: ProjectState,
  context: ContextPayload
): string {
  const phase = state.phase;
  const tddSubPhase = state.tddSubPhase;

  switch (phase) {
    case "DISCUSS":
      return buildDiscussPrompt(state, context);
    case "RESEARCH":
      return buildResearchPrompt(state, context);
    case "PLAN_MILESTONE":
      return buildPlanMilestonePrompt(state, context);
    case "PLAN_SLICE":
      return buildPlanSlicePrompt(state, context);
    case "EXECUTE_TASK":
      return buildExecuteTaskPrompt(tddSubPhase, context);
    case "COMPLETE_SLICE":
      return buildCompleteSlicePrompt(state, context);
    case "RETROSPECTIVE":
      return buildRetrospectivePrompt(state, context);
    case "REASSESS":
      return buildReassessPrompt(state, context);
    case "COMPLETE_MILESTONE":
      return buildCompleteMilestonePrompt(state, context);
    default:
      return "No prompt for phase: " + phase;
  }
}

// ─── Phase-Specific Prompts ──────────────────────────────────────

function buildDiscussPrompt(state: ProjectState, ctx: ContextPayload): string {
  const outputPath = state.currentMilestone
    ? `${PATHS.milestonePath(state.currentMilestone)}/CONTEXT.md`
    : ".superclaude/state/CONTEXT.md";

  return `# DISCUSS PHASE

You are the Architect sub-agent. Your job is to identify gray areas in the requirements and ask structured questions to clarify them.

## Task Plan
${ctx.taskPlan}

## Instructions
1. Read the project requirements carefully
2. Identify all ambiguous areas where multiple reasonable approaches exist
3. For each gray area, formulate a specific question
4. Write the output to the file path specified below

## CRITICAL: Output File
You MUST write your output to this exact path using the Write tool:
**${outputPath}**

## Output Format
Write a file with this structure:
\`\`\`markdown
---
milestone: ${state.currentMilestone ?? "unknown"}
created: [ISO date]
---

## Decisions

### 1. [Topic]
**Options:** A) ... B) ... C) ...
**My recommendation:** ...
**Why it matters:** ...
\`\`\`

## Scope Guard
- DO NOT design implementation details
- DO NOT write any code
- ONLY identify decisions that need to be made`;
}

function buildResearchPrompt(state: ProjectState, ctx: ContextPayload): string {
  const outputPath = state.currentMilestone
    ? `${PATHS.milestonePath(state.currentMilestone)}/RESEARCH.md`
    : ".superclaude/state/RESEARCH.md";

  return `# RESEARCH PHASE

You are the Researcher sub-agent. Scout the codebase and relevant documentation.

## Task Plan
${ctx.taskPlan}

## Current Code
${formatCodeFiles(ctx.codeFiles)}

## Instructions
1. Scan the codebase for relevant existing patterns
2. Identify libraries that should be used (not hand-rolled)
3. Identify common pitfalls with the relevant technologies
4. Write the output to the file path specified below

## CRITICAL: Output File
You MUST write your output to this exact path using the Write tool:
**${outputPath}**

## Output Format
\`\`\`markdown
## Don't Hand-Roll
- [Library]: [What it handles] — [Why not build it]

## Common Pitfalls
- [Pitfall]: [Why it happens] — [How to avoid]

## Relevant Code Locations
- [path]: [what's there, why it matters]

## Patterns to Follow
- [pattern]: [where it's used, how to follow it]
\`\`\`

## Scope Guard
- DO NOT write implementation code
- DO NOT make architecture decisions
- ONLY research and report findings`;
}

function buildPlanMilestonePrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const outputPath = `${PATHS.milestonePath(milestoneId)}/ROADMAP.md`;

  return `# PLAN_MILESTONE PHASE

You are the Architect sub-agent. Decompose milestone ${milestoneId} into ordered, demoable vertical slices.

## Context
${ctx.taskPlan}

${ctx.upstreamSummaries.length > 0 ? `## Prior Decisions\n${ctx.upstreamSummaries.join("\n\n")}` : ""}

## Instructions
1. Read the requirements and any discuss-phase decisions
2. Decompose into 3-8 vertical slices (use S01, S02, S03... naming)
3. Each slice MUST pass the demo sentence test: "After this, the user can ___"
4. Define boundary maps between slices (what each produces/consumes)
5. Assess risk per slice

## CRITICAL: Output File
You MUST write the roadmap to this exact path using the Write tool:
**${outputPath}**

## Output Format
The file MUST use this exact structure (the orchestrator parses S01, S02 etc. from it):
\`\`\`markdown
---
milestone: ${milestoneId}
status: planned
---

## Slices

### S01: [Name]
**Demo:** After this, the user can ___
**Depends on:** none
**Risk:** low | medium | high
**Produces:** [files, exports]
**Consumes:** [from upstream slices]

### S02: [Name]
**Demo:** After this, the user can ___
**Depends on:** S01
**Risk:** low | medium | high
**Produces:** [files, exports]
**Consumes:** [from upstream slices]

### S03: [Name]
...
\`\`\`

## Scope Guard
- DO NOT plan task-level details (that's PLAN_SLICE)
- DO NOT write implementation code
- Each slice must be a VERTICAL capability, not a horizontal layer
- Use S01, S02, S03 etc. as slice IDs — the orchestrator depends on this format`;
}

function buildPlanSlicePrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const sliceId = state.currentSlice ?? "S01";
  const outputPath = `${PATHS.slicePath(milestoneId, sliceId)}/PLAN.md`;

  return `# PLAN_SLICE PHASE

You are the Architect sub-agent. Decompose slice ${sliceId} into context-window-sized tasks with TDD sequences.

## Slice Plan
${ctx.taskPlan}

## Boundary Contracts
${ctx.boundaryContracts.join("\n\n")}

## Upstream Summaries
${ctx.upstreamSummaries.join("\n\n")}

## Instructions
1. Break the slice into 1-7 tasks (use T01, T02, T03... naming)
2. Each task must fit in one context window
3. Define TDD sequence: what tests to write first, then implementation
4. Define must-haves: truths, artifacts (with file paths, min lines, required exports), key links
5. Define must-NOT-haves: explicit scope boundaries

## CRITICAL: File Paths
All file paths in the plan MUST be relative to the project root directory (where CLAUDE.md lives).
The orchestrator resolves paths as \`projectRoot + "/" + path\`. If source code lives in a subdirectory
(e.g. \`playground/src/\`, \`packages/app/src/\`), you MUST include that prefix.

Look at existing code files and upstream summaries to determine the correct path prefix.
For example, if existing files are at \`playground/src/db.ts\`, then new files must also use
\`playground/src/\` — NOT bare \`src/\`.

Wrong: \`src/cards/card.repo.ts\`
Right: \`playground/src/cards/card.repo.ts\` (if that's where existing code lives)

## CRITICAL: Output File
You MUST write the plan to this exact path using the Write tool:
**${outputPath}**

## Output Format
The file MUST use this structure (the orchestrator parses T01, T02 etc. from it):
\`\`\`markdown
---
slice: ${sliceId}
milestone: ${milestoneId}
status: planned
---

## Tasks

### T01: [Task Name]
**Goal:** [One sentence]

#### TDD Sequence
- Test file(s): [full paths from project root, e.g. playground/src/foo.test.ts]
- Test cases: [list]
- Implementation file(s): [full paths from project root]

#### Must-Haves
**Truths:** [observable behaviors]
**Artifacts:** [file path — description, min lines, exports]
**Key Links:** [file A imports X from file B]

#### Must-NOT-Haves
- [explicit scope boundaries]

### T02: [Task Name]
...
\`\`\`

## Scope Guard
- DO NOT implement anything
- Each task must be small enough for one agent session
- Use T01, T02, T03 etc. as task IDs — the orchestrator depends on this format
- If you need more than 7 tasks, the slice is too big — flag it`;
}

function buildExecuteTaskPrompt(
  tddSubPhase: TDDSubPhase | null,
  ctx: ContextPayload
): string {
  return buildImplementPrompt(ctx);
}

function buildImplementPrompt(ctx: ContextPayload): string {
  return `# EXECUTE TASK — TDD Implementation (One-Shot)

You are the Implementer sub-agent. Complete this task using strict TDD: write tests first, then implement, then clean up.

## Task Plan
${ctx.taskPlan}

${formatUpstreamContext(ctx.upstreamSummaries)}

## Current Code
${formatCodeFiles(ctx.codeFiles)}

${formatVaultDocs(ctx.vaultDocs)}

## TDD Protocol — Follow This Order Exactly

### Step 1: RED — Write Failing Tests
- Read the task's TDD Sequence section for EXACT test file paths
- Write test files at those EXACT paths
- Tests must be runnable with \`bun test\`
- Tests must cover: happy path, edge cases, error cases, integration points
- Use descriptive test names that read like specifications
- Do NOT write any implementation code yet

### Step 2: GREEN — Make Tests Pass
- Read the task's Artifacts section for EXACT implementation file paths
- Write the MINIMUM code to make all tests pass
- Create files at the EXACT paths specified
- All must-have artifacts must exist with real implementation (no stubs)
- All must-have key links must be wired (imports connected)
- Run \`bun test\` to verify all tests pass

### Step 3: REFACTOR — Clean Up
- Refactor for clarity, consistency, and quality
- Follow established patterns from vault docs
- Do NOT add new functionality
- Run \`bun test\` to confirm tests still pass

## CRITICAL: File Paths
All file paths in the task plan are relative to the project root.
Write files at the EXACT paths specified — do not modify or shorten them.

## Verification (run these before finishing)
- \`bun test\` — all tests pass
- No TODO/FIXME/stub patterns in implementation files
- All must-have exports present
- All must-have imports wired

## Scope Guard (HIGH ATTENTION)
- ONLY implement what the task plan specifies
- Do NOT add unrequested features, tests, or files
- Do NOT modify files outside the task's artifact list
- If something seems missing from the plan, implement the minimum — do NOT expand scope`;
}

function buildCompleteSlicePrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const sliceId = state.currentSlice ?? "S01";
  const summaryPath = `${PATHS.slicePath(milestoneId, sliceId)}/SUMMARY.md`;
  const uatPath = `${PATHS.slicePath(milestoneId, sliceId)}/UAT.md`;

  return `# COMPLETE_SLICE PHASE

You are the Scribe sub-agent. Summarize what was built in slice ${sliceId}.

## Task Summaries
${ctx.upstreamSummaries.join("\n\n")}

## Slice Plan
${ctx.taskPlan}

## Instructions
1. Write SUMMARY.md — what was built, decisions, patterns
2. Write UAT.md — human-readable acceptance test script with copy-pasteable commands

## CRITICAL: Output Files
You MUST write these files using the Write tool:
- **${summaryPath}**
- **${uatPath}**`;
}

function buildRetrospectivePrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const sliceId = state.currentSlice ?? "S01";

  return `# RETROSPECTIVE PHASE

You are the Evolver sub-agent. Analyze the completed slice's execution history and extract knowledge for the vault.

## Completed Slice Summary
${ctx.upstreamSummaries.join("\n\n")}

## Slice Plan
${ctx.taskPlan}

## Current Vault
${formatVaultDocs(ctx.vaultDocs)}

## Instructions

### 1. Extract LEARNINGS (vault/learnings/)
What went wrong, what was surprising, what should future agents avoid?
- Must be **actionable** — not "tests are important" but "Bun mock.module is global, use in-memory DBs instead"
- Must be **generalizable** to future slices, not one-off fixes
- Include the root cause, not just the symptom
- Max 5 learnings per slice — prioritize by impact

### 2. Extract DECISIONS (vault/decisions/)
What architectural choices emerged during implementation?
- Only non-obvious decisions that a future architect needs to know
- Include the alternatives that were considered and why they were rejected
- Format as lightweight ADRs

### 3. Extract PLAYBOOKS (vault/playbooks/)
Did any manual intervention happen that could be a documented procedure?
- Recovery steps, debugging workflows, operational runbooks
- Must be repeatable — not ad-hoc one-time fixes

### 4. Update PATTERNS (vault/patterns/)
Should any existing vault docs be updated with new findings?
- New anti-patterns discovered
- Refinements to existing conventions

### 5. Update INDEX (vault/INDEX.md)
Add entries for all new vault documents.

## CRITICAL: You MUST Create Files

You MUST call the Write tool to create each vault document as a separate file on disk.
Do NOT just describe or summarize what you would write — actually write each file.
If you do not call Write for each document, the orchestrator will detect 0 vault docs and the phase fails.

**File paths** (relative to project root):
- Learnings: \`.superclaude/vault/learnings/<slug>.md\` (e.g. \`.superclaude/vault/learnings/db-test-isolation.md\`)
- Decisions: \`.superclaude/vault/decisions/ADR-<NNN>-<slug>.md\` (e.g. \`.superclaude/vault/decisions/ADR-001-fixed-columns.md\`)
- Playbooks: \`.superclaude/vault/playbooks/<slug>.md\` (e.g. \`.superclaude/vault/playbooks/test-failure-recovery.md\`)
- Updated INDEX: \`.superclaude/vault/INDEX.md\`

**Example** — a learning file at \`.superclaude/vault/learnings/db-test-isolation.md\`:
\`\`\`markdown
---
title: Database Test Isolation
type: learning
source: ${milestoneId}/${sliceId}
tags: [testing, database, bun]
---

## Problem
Full test suite fails while individual test files pass in isolation.

## Root Cause
SQLite file-based databases share state across test files when run in parallel.

## Fix
Each test file must create its own in-memory or temp-file database in beforeEach and destroy it in afterEach.
\`\`\`

## Quality Rules
- Each document must have proper frontmatter (title, type, source, tags)
- Each learning must be under 15 lines
- Deduplicate — if a learning already exists in the vault, skip or merge
- Source reference required — which slice/task/error it came from (${milestoneId}/${sliceId})
- Tags required — for relevance matching during context assembly
- You MUST write at least 1 learning — if nothing went wrong, document what went RIGHT as a pattern to repeat

## Scope Guard
- DO NOT modify any code
- DO NOT modify the roadmap (that's the next phase)
- ONLY write vault documents and update INDEX.md`;
}

function buildReassessPrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const roadmapPath = `${PATHS.milestonePath(milestoneId)}/ROADMAP.md`;

  return `# REASSESS PHASE

Review the roadmap in light of what was learned during the completed slice.

## Completed Slice Summary
${ctx.upstreamSummaries.join("\n\n")}

## Current Roadmap
${ctx.taskPlan}

## Instructions
1. Does the roadmap still make sense?
2. Should any slices be reordered, added, removed, or modified?
3. If changes are needed, update the roadmap file at: **${roadmapPath}**
4. If no changes needed, output "No changes to roadmap."`;
}

function buildCompleteMilestonePrompt(state: ProjectState, ctx: ContextPayload): string {
  const milestoneId = state.currentMilestone ?? "M001";
  const summaryPath = `${PATHS.milestonePath(milestoneId)}/SUMMARY.md`;

  return `# COMPLETE_MILESTONE PHASE

Summarize milestone ${milestoneId}.

## Slice Summaries
${ctx.upstreamSummaries.join("\n\n")}

## Instructions
1. Write a milestone summary
2. List all capabilities delivered
3. Note any known limitations or deferred work

## CRITICAL: Output File
You MUST write the summary to this exact path using the Write tool:
**${summaryPath}**`;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatCodeFiles(files: Record<string, string>): string {
  if (Object.keys(files).length === 0) return "_No code files loaded._";

  return Object.entries(files)
    .map(([path, content]) => `### ${path}\n\`\`\`typescript\n${content}\n\`\`\``)
    .join("\n\n");
}

function formatVaultDocs(docs: string[]): string {
  if (docs.length === 0) return "";
  return `## Vault Docs\n${docs.join("\n\n")}`;
}

function formatUpstreamContext(summaries: string[]): string {
  if (summaries.length === 0) return "";
  return `## Context\n${summaries.join("\n\n")}`;
}
