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
- Test file(s): [paths]
- Test cases: [list]
- Implementation file(s): [paths]

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
  switch (tddSubPhase) {
    case "RED":
      return buildRedPrompt(ctx);
    case "GREEN":
      return buildGreenPrompt(ctx);
    case "REFACTOR":
      return buildRefactorPrompt(ctx);
    case "VERIFY":
      return buildVerifyPrompt(ctx);
    default:
      return buildRedPrompt(ctx);
  }
}

function buildRedPrompt(ctx: ContextPayload): string {
  return `# TDD — RED PHASE (Write Failing Tests)

You are the Implementer sub-agent in RED mode.

## Task Plan
${ctx.taskPlan}

${formatUpstreamContext(ctx.upstreamSummaries)}

## Current Code
${formatCodeFiles(ctx.codeFiles)}

${formatVaultDocs(ctx.vaultDocs)}

## Instructions
1. Read the task's must-haves carefully — they specify EXACT file paths for all artifacts
2. Write test files at the EXACT paths specified in the TDD Sequence section
3. Tests MUST be runnable with \`bun test\`
4. Tests MUST FAIL (they test behavior that doesn't exist yet)
5. Do NOT write any implementation code

## CRITICAL: File Paths
All file paths in the task plan are relative to the project root.
Write files at the EXACT paths specified — do not modify or shorten them.

## Constraints
- Test behavior, not implementation details
- Use descriptive test names that read like specifications
- Co-locate test files: \`foo.test.ts\` next to \`foo.ts\`

## Scope Guard
- ONLY write test files
- Do NOT write implementation code
- Do NOT add features beyond the must-haves`;
}

function buildGreenPrompt(ctx: ContextPayload): string {
  return `# TDD — GREEN PHASE (Make Tests Pass)

You are the Implementer sub-agent in GREEN mode.

## Task Plan
${ctx.taskPlan}

${formatUpstreamContext(ctx.upstreamSummaries)}

## Current Code
${formatCodeFiles(ctx.codeFiles)}

${formatVaultDocs(ctx.vaultDocs)}

## Instructions
1. Read the failing tests and the task plan's must-have artifacts
2. Create implementation files at the EXACT paths specified in the task plan
3. Write the MINIMUM code to make all tests pass
4. Focus on correctness, not elegance
5. Run \`bun test\` to verify all tests pass

## CRITICAL: File Paths
All file paths in the task plan are relative to the project root.
Create files at the EXACT paths specified in the Artifacts section — do not modify or shorten them.

## Constraints
- Minimum viable implementation — no gold-plating
- All must-have artifacts must exist with real implementation (no stubs)
- All must-have key links must be wired

## Scope Guard
- ONLY implement what the tests require
- Do NOT add unrequested features
- Do NOT refactor (that's the next phase)`;
}

function buildRefactorPrompt(ctx: ContextPayload): string {
  return `# TDD — REFACTOR PHASE (Clean Up)

You are the Implementer sub-agent in REFACTOR mode.

## Task Plan
${ctx.taskPlan}

## Current Code
${formatCodeFiles(ctx.codeFiles)}

${formatVaultDocs(ctx.vaultDocs)}

## Instructions
1. All tests are currently passing — keep them passing
2. Refactor for clarity, consistency, and quality
3. Follow established patterns from the vault docs
4. Run \`bun test\` after refactoring to confirm tests still pass

## Constraints
- Do NOT add new functionality
- Do NOT change test behavior
- If refactoring breaks tests, revert the change

## Scope Guard
- ONLY clean up existing implementation
- Do NOT add new features or tests`;
}

function buildVerifyPrompt(ctx: ContextPayload): string {
  return `# TDD — VERIFY PHASE (Comprehensive Check)

Run the following verification commands and report results:

1. \`bun test\` — Full test suite
2. \`bunx tsc --noEmit\` — Type checking
3. Check must-haves from the task plan

## Task Plan
${ctx.taskPlan}

## Must-Haves Checklist
Report pass/fail for each must-have item.`;
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
