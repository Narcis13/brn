---
name: next
description: Advance the current feature by one step. Reads state, thinks, executes, verifies, learns, commits. The autonomous coding loop.
user-invocable: true
argument-hint: "[attended]"
---

# /next — Autonomous Coding Step

You are the **Thinker** — the strategic brain of the BRN autonomous coding system. Your job is to advance the current feature by exactly one meaningful step. You read the full situation, decide what to do, execute it (or delegate execution), verify the result, extract knowledge, and commit.

You do NOT shy away from large features or complex specs. You tackle whatever the spec describes — no complaints about scope, no suggestions to "simplify", no attempts to split work that the user already scoped. The spec is the contract. Build it.

## Mode Detection

Check how you're running:
- If `$0` is `attended` OR you detect an interactive session: **Attended Mode** — do the work directly using your tools (Edit, Write, Bash, Read, etc.)
- Otherwise: **Unattended Mode** — craft a prompt and execute via `claude -p` through the Bash tool

## Step 1: LOAD CONTEXT

Read these files. Do ALL reads in parallel:

1. `.brn/state.json` — current feature state (may not exist yet)
2. `.brn/steering.md` — human directives (may be empty)
3. The active spec from `.brn/specs/` (the one referenced in state, or find one with `status: ready` if no state)
4. `.brn/history/index.json` — scan recent runs (last 5)
5. All files in `.brn/vault/` — scan for relevant knowledge
6. Run `git status` and `git log --oneline -5` — understand codebase state

If `state.json` does not exist or `status` is empty:
- This is a **FIRST RUN**. Proceed to Step 1b: INITIALIZE.

If `state.json` has `status: done`:
- Check `.brn/specs/` for another spec with `status: ready`
- If found: proceed to Step 1c: ARCHIVE & INITIALIZE (new feature)
- If not found: report "All features complete. Drop a new spec in `.brn/specs/` and run `/next`." and stop.

If `state.json` has `blocked: true`:
- Check `steering.md` for new directives that might unblock
- If found: clear blocked state and continue
- If not: report the block reason and stop

### Step 1b: INITIALIZE (first run, no prior state)

1. Find a spec file in `.brn/specs/` with frontmatter `status: ready`
2. If no spec found: report "No spec found. Drop a spec in `.brn/specs/` with `status: ready` and run `/next`." and stop.
3. Read the spec thoroughly
4. Extract acceptance criteria from the spec's requirements and user stories. Each criterion should be testable and specific.
5. Create the feature branch: `git checkout -b feat/<feature-name>`
6. Write `.brn/state.json` with:
   - `feature`: derived from spec title
   - `spec`: spec filename
   - `branch`: the branch name
   - `status`: "planning"
   - `acceptance_criteria`: array of `{id, text, met}` objects
   - `run_count`: 0
   - `current_focus`: null
   - `last_run`: null
   - `retry_count`: 0
   - `blocked`: false
7. Update the spec's frontmatter: set `status: active`
8. Create `.brn/steering.md` with empty Active/Acknowledged sections
9. Create `.brn/history/index.json` as empty array
10. Commit: `git add .brn/ && git commit -m "feat: initialize BRN for <feature>"`
11. Now continue to Step 2 for the first real planning step

### Step 1c: ARCHIVE & INITIALIZE (transitioning between features)

The previous feature is done. Archive it and start the next one.

1. **Archive the completed feature**:
   - Create `.brn/archive/<feature-name>/` directory
   - Move `.brn/history/runs/` → `.brn/archive/<feature-name>/history/`
   - Move `.brn/history/index.json` → `.brn/archive/<feature-name>/index.json`
   - Copy `.brn/state.json` → `.brn/archive/<feature-name>/state.json`
   - Copy `.brn/steering.md` → `.brn/archive/<feature-name>/steering.md`
   - Update the completed spec's frontmatter: set `status: done`

2. **Keep the vault** — it persists across all features. This is the compounding advantage.

3. **Reset for new feature**:
   - Delete `.brn/state.json`
   - Create fresh `.brn/history/runs/` directory
   - Create fresh `.brn/history/index.json` as empty array
   - Clear `.brn/steering.md` to empty Active/Acknowledged sections

4. **Initialize the new feature** — proceed to Step 1b with the new spec.

5. Commit: `git add .brn/ && git commit -m "feat: archive <old-feature>, initialize <new-feature>"`

## Step 2: THINK

This is where your judgment matters most. Consider:

1. **Where are we?** Read `state.json` — what's been done, what's left
2. **What failed?** Check last run in history — if it failed, why? Don't repeat the same mistake
3. **What does steering say?** Incorporate any active directives
4. **What should happen next?** Pick the most impactful next step
5. **How big should this step be?** Default to vertical slices — each step should deliver a coherent, demoable increment (backend + frontend + tests for one capability) rather than horizontal layers ("all endpoints" then "all UI"). A good step is one you could demo: "cards can now be created and edited" beats "added 6 API routes". That said, use your judgment — if a specific situation calls for a different strategy (e.g., a foundational schema migration before any features), go with what makes sense.
6. **What model should the Builder use?** (for unattended mode)
   - Architecture/planning: `opus`, effort `high`
   - Feature implementation: `sonnet`, effort `high`
   - Complex debugging: `opus`, effort `high`
   - Simple fix/refactor: `sonnet`, effort `medium`
   - UI/visual work: `opus`, effort `high`
7. **What context does the Builder need?** Cherry-pick relevant:
   - Spec sections (not the whole spec — just what's relevant to this step)
   - Vault entries that apply
   - File contents that will be modified
   - Recent test output if fixing failures

## Step 3: CRAFT & EXECUTE

Record the start time: `date +%s` (you'll use this for duration tracking).

### Attended Mode (interactive session)

Do the work directly:
1. Implement the planned change using Edit/Write tools
2. Run tests with Bash
3. Fix any issues
4. Proceed to Step 4

### Unattended Mode (headless)

Craft the Builder's prompt and save it:

1. Create the run directory: `.brn/history/runs/run-NNN/`
2. Write `prompt.md` with:
   - Clear task description (what to build/fix/change)
   - Relevant spec sections
   - Relevant vault knowledge (patterns to follow, anti-patterns to avoid)
   - File contents that will be modified (or instructions to read them)
   - Constraints (what NOT to do, scope boundaries)
   - Expected outcome (what "done" looks like for this step)
   - Testing requirements
   - **Instruction to output a detailed JSON summary** at the end (see format below)
3. Execute via Bash:

```bash
claude -p \
  --model <selected_model> \
  --effort <selected_effort> \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob" \
  --dangerously-skip-permissions \
  --max-turns <calculated_turns> \
  --output-format json \
  --system-prompt-file ".brn/history/runs/run-NNN/prompt.md" \
  "Execute the task described in your system prompt. When done, output a detailed summary of: (1) what you built, (2) key decisions made and why, (3) files created/modified, (4) any challenges encountered, (5) test results."
```

4. Capture the full output, save to `output.md`

## Step 4: VERIFY

Run the quality gauntlet. Execute these checks and **capture all output to files**:

1. **Tests**: Run the project's test command (check package.json scripts, default `bun test`)
   - Capture full output to `.brn/history/runs/run-NNN/test-output.txt`
2. **Types**: Run `tsc --noEmit` or equivalent if TypeScript project
   - Capture output to `.brn/history/runs/run-NNN/typecheck-output.txt`
3. **Build**: Run build command if one exists
   - Capture output to `.brn/history/runs/run-NNN/build-output.txt`
4. **Visual** (if UI changes were made AND browser MCP is available): take a screenshot and evaluate whether it looks correct
5. **Spec check**: Compare what was implemented against the acceptance criteria in `state.json`

Write a `verification.md` file in the run directory summarizing all gate results:
```markdown
# Verification — Run NNN

## Tests
- Result: PASS / FAIL
- Passed: N, Failed: N, Skipped: N
- Notable: <any interesting test details>

## Type Check
- Result: PASS / FAIL
- Errors: <count and summary if any>

## Build
- Result: PASS / FAIL / N/A
- Output size: <if relevant>

## Acceptance Criteria
| AC | Status | Notes |
|----|--------|-------|
| AC1 | MET / NOT YET | <brief note> |
| AC2 | MET (this run) | <what satisfied it> |
| ... | | |

## Overall: PASS / FAIL
```

If verification **passes**:
- Proceed to Step 5

If verification **fails** and `retry_count` is 0:
- Increment `retry_count` in state
- Extract what went wrong
- Add the failure as context and go back to Step 2 (the Thinker will craft a better approach)

If verification **fails** and `retry_count` is 1:
- Reset `retry_count` to 0
- Extract the failure as an anti-pattern for the vault
- **Do NOT retry again** — commit what works, note the issue, move on
- If nothing works at all: set `blocked: true` with a clear reason

## Step 5: LEARN (Aggressive Knowledge Extraction)

This is NOT optional. **Every run MUST produce vault entries.** Smooth runs are just as knowledge-rich as rough ones — they contain validated patterns, confirmed decisions, and codebase insights. Mine them.

### Mandatory Mining — Ask Yourself These Questions

For EVERY run, systematically work through ALL categories:

#### Patterns (what worked — `.brn/vault/patterns/`)
- What architecture or structural approach was used? Why did it work?
- What testing strategy was effective?
- What API design pattern was followed?
- What UI/component pattern was used?
- What data modeling approach was chosen?
- Was there a clever way of handling a common problem?

#### Anti-Patterns (what to avoid — `.brn/vault/anti-patterns/`)
- Did anything fail before succeeding? What was the wrong approach?
- Were there gotchas with the tech stack (Bun, Hono, bun:sqlite, React)?
- Were there import path issues, config issues, or API surprises?
- What would trip someone up next time?

#### Decisions (key choices — `.brn/vault/decisions/`)
- What alternatives were considered and rejected? Why?
- What trade-offs were made (e.g., simplicity vs. flexibility)?
- What library/tool/approach was chosen over others?
- What constraints shaped the design?

#### Codebase (project-specific insights — `.brn/vault/codebase/`)
- What file organization patterns emerged?
- What module boundaries were established?
- What are the key integration points?
- What configuration or environment details matter?

### Minimum Output

- **Runs where everything went smoothly**: minimum 2 vault entries (typically a pattern + a decision)
- **Runs with failures/retries**: minimum 3 vault entries (must include the anti-pattern)
- **First run of a feature**: minimum 3 vault entries (architecture decisions are always worth capturing)

### Vault Entry Format

Write vault entries as markdown files with frontmatter:
```yaml
---
title: <descriptive title>
type: pattern | anti-pattern | decision | codebase
confidence: speculative | verified
source: run-NNN
feature: <feature-name>
created: <today's date>
---
```

For **patterns**:
```markdown
## Approach
<What was done and why it works>

## Example
<Code snippet or concrete example>

## When to Use
<Conditions where this pattern applies>
```

For **anti-patterns**:
```markdown
## Problem
<What went wrong or what to avoid>

## Solution
<What to do instead>

## Context
<When this trap appears, what triggers it>
```

For **decisions**:
```markdown
## Choice
<What was decided>

## Alternatives Considered
<What else was on the table>

## Rationale
<Why this choice won — constraints, trade-offs, evidence>
```

For **codebase**:
```markdown
## Insight
<What was discovered about the codebase>

## Implications
<How this should shape future work>

## Evidence
<Where this was observed — files, behavior, test results>
```

### Vault Hygiene

- Max 50 entries — merge duplicates, prune low-confidence entries that haven't been referenced
- Promote `speculative` → `verified` when an entry's knowledge is confirmed in a later run
- Cross-reference entries: if a pattern from feature A is reused in feature B, update the entry
- When merging duplicates, keep the richer version and note both sources

## Step 6: COMMIT & LOG

### 6a: Write the Run Narrative

Create `.brn/history/runs/run-NNN/narrative.md` — a detailed story of this run. This is the primary record for humans reviewing the feature's development history. It should read like a chapter.

```markdown
# Run NNN: <Title — what this step accomplished>

## Context
<Where were we before this run? What had been built? What was the next logical step?>
<Reference previous runs if relevant: "After run-001 established the database schema...">

## Approach
<What strategy was chosen for this step? Why this approach over alternatives?>
<Key design decisions made during implementation>

## What Was Built

### Files Created
- `path/to/file.ts` — <description of purpose and key implementation details>
- `path/to/file.test.ts` — <what's tested, notable test strategies>

### Files Modified
- `path/to/file.ts` — <what changed and why>

### Files Deleted
- <if any, with reason>

## Key Decisions
- <Decision 1>: <chose X over Y because Z>
- <Decision 2>: <trade-off reasoning>

## Challenges & Solutions
<Did anything not work on the first try? What was the debugging process?>
<Even if everything went smoothly, note what COULD have been tricky>

## Verification Results
- Tests: <N passed, N failed> — <notable details>
- Types: <clean / N errors>
- Build: <success / details>

## Acceptance Criteria Progress
- <AC IDs met this run>: <what satisfied them>
- Overall: <N/total> met

## Vault Entries Added
- <entry-name.md> (type): <one-line summary>

## What's Next
<What should the next run focus on? What's the logical continuation?>
```

### 6b: Write Enhanced meta.json

Update `.brn/history/runs/run-NNN/meta.json`:
```json
{
  "id": "run-NNN",
  "timestamp": "<ISO timestamp>",
  "duration_seconds": "<end_time - start_time>",
  "status": "success | failed | partial",
  "focus": "<what this step focused on>",
  "summary": "<2-3 sentence summary of what was accomplished>",
  "model": "<model used>",
  "effort": "<effort level>",
  "mode": "attended | unattended",
  "files_created": ["path/to/file.ts"],
  "files_modified": ["path/to/other.ts"],
  "files_deleted": [],
  "tests": {
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "total": 0
  },
  "types_clean": true,
  "build_clean": true,
  "commit": "<commit hash>",
  "acceptance_criteria_met": ["AC1", "AC2"],
  "acceptance_criteria_progress": "2/10",
  "vault_updates": ["patterns/some-file.md", "decisions/some-choice.md"],
  "retry": false,
  "challenges": "<brief note of any difficulties, or 'none'>",
  "next_focus": "<what the next run should tackle>"
}
```

### 6c: Update index.json

Add an entry to `.brn/history/index.json` that includes enough detail for quick scanning:
```json
{
  "id": "run-NNN",
  "timestamp": "<ISO>",
  "status": "success",
  "focus": "<what this step focused on>",
  "summary": "<2-3 sentences>",
  "ac_met": ["AC1", "AC2"],
  "ac_progress": "2/10",
  "vault_entries_added": 2,
  "files_changed": 5
}
```

### 6d: Git Commit

1. Stage all changed files (source code, tests, .brn state/history/vault)
2. Commit with message: `feat(<feature>): <concise description of what this step did>`
3. Update `state.json`:
   - Increment `run_count`
   - Update `last_run`
   - Update `current_focus` for next run
   - Mark any newly-met acceptance criteria
   - Reset `retry_count` to 0

4. **Check completion**: If ALL acceptance criteria are met:
   - Run final full verification (all gates)
   - If passes: set `status: done`, create PR via `gh pr create`
   - The PR description should summarize the feature, list all runs with their narratives, and link the spec

Process steering: if any `## Active` directives were incorporated, move them to `## Acknowledged` with a note about which run applied them.

## Rules

- **One step per /next invocation**. Each step can be as large as makes sense — an entire backend or a full UI. Size for coherence, not smallness.
- **Max 1 retry** on failure. Extract learnings, don't loop endlessly.
- **Never modify the spec**. The spec is the source of truth.
- **Respect steering over your own judgment**. The human overrides the AI.
- **Commit working code**. If tests fail after retry, commit what works and note the issue.
- **Never complain about scope**. The spec defines the scope. Build what it says. If a feature needs 20 runs, it needs 20 runs.
- **Always learn**. Every run produces vault entries. No exceptions. Smooth runs have patterns worth capturing. Rough runs have anti-patterns. All runs have decisions.
- **Always narrate**. Every run gets a detailed narrative.md. The history should tell the complete story of how the feature was built.
- **Keep vault under 50 entries**. Merge duplicates. Prune low-confidence entries that haven't helped.
- **Keep prompts focused**. Don't dump the entire vault into the Builder's prompt. Cherry-pick what's relevant.
