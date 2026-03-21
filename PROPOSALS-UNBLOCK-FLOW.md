# Proposals: Unblocking Autonomous Flow

## Problem Statement

The orchestrator's goal is fully autonomous execution: plan, implement, verify, commit, repeat — zero human intervention. In practice, the loop gets stuck or produces suboptimal outcomes in predictable ways. This document proposes changes to remove those hard stops.

**Evidence base:** 20 sessions across M001 (S01-S03), 13 tasks completed, 3 stuck dispatches (all in S03), 15 MUST-FIX review issues across 2 slice completions, 1 persistent test failure.

---

## 1. Task-Level TDD Classification

### The Problem
Every task goes through TDD enforcement regardless of whether TDD is the right strategy. Infrastructure tasks (DB setup, server config, migration logic), integration wiring, and scaffolding tasks are shoehorned into RED-GREEN-REFACTOR. This causes:

- **S01/T01** accumulated 7 MUST-FIX review issues because TDD forced testing DB initialization and server startup in isolation, resulting in module-level side effects and untestable architecture
- Tasks that are primarily "wire things together" produce trivial tests that don't catch real issues
- The agent spends tokens writing tests for boilerplate (config parsing, re-exports, route registration)

### Proposal: Let PLAN_SLICE classify each task's verification strategy

During PLAN_SLICE, the planner assigns each task one of three strategies:

| Strategy | When to Use | Enforcement |
|----------|------------|-------------|
| `tdd-strict` | Pure logic, algorithms, services, repositories | Full RED-GREEN-REFACTOR. Tests must fail first, then pass. Current behavior. |
| `test-after` | Integration wiring, API routes, middleware chains | Implement first, then write tests. Orchestrator verifies tests exist and pass, but doesn't require them to fail first. |
| `verify-only` | Infrastructure setup, config, scaffolding, migrations | No test requirement. Verified by static checks (files exist, exports present, no stubs) + command-tier (tsc, linter). |

**How it flows:**
- PLAN.md gets a new field per task: `strategy: tdd-strict | test-after | verify-only`
- `plan-parser.ts` extracts it (default: `tdd-strict` for backward compat)
- `state.ts` passes strategy to `tdd.ts` enforcement
- `tdd.ts` skips test-existence checks for `verify-only`, skips RED-must-fail for `test-after`
- `prompt-builder.ts` adjusts the prompt to match (no "write failing tests first" for `test-after`)

**Impact:** Eliminates forced TDD on tasks where it creates friction without value. The planner makes this call with full context about the task.

---

## 2. Test Isolation by Default

### The Problem
`bun test` runs all tests in a shared process by default. S03/T02 hit test crosstalk: full suite showed 5 failures + 1 error, but individual tests passed in isolation. The Doctor diagnosed "cross-test interference" — likely shared SQLite state or fixture pollution.

This is a recurring risk because:
- Every task creates its own test database, but `bun test` may run files in parallel
- `mock.module()` in one test file can leak into others
- SQLite in-memory databases are per-connection, but file-based ones share state

### Proposal: Per-file test isolation is already happening, but add database isolation

`tdd.ts` already runs tests per-file (line 55-108). The issue is database state leaking between test files when running the full suite at COMPLETE_SLICE verification.

Changes:
- **Each test file gets its own temp database** — `beforeEach` creates `/tmp/superclaude-test-{random}/data.db`, `afterEach` deletes it. Add this as a vault pattern that the planner injects into every task with DB access.
- **`runFullTestSuite`** in `tdd.ts` should run files sequentially (not in parallel) during slice verification. Add `--concurrency 1` flag.
- **Prompt injection** — `buildImplementPrompt` should include: "Each test file must create and destroy its own database. Never share database state between test files."

**Impact:** Eliminates the #1 cause of stuck dispatches in S03.

---

## 3. Graceful Degradation Instead of Hard Stops

### The Problem
When TDD fails after 3 retries + Doctor diagnosis, the task is marked "blocked" and the loop breaks. This is a hard stop that requires a new session to recover. All 3 stuck dispatches in S03 auto-recovered by simply starting a new session — suggesting the block was transient.

### Proposal: Skip-and-continue with deferred retry

Instead of `break` on stuck:

```
if task stuck after retries + Doctor:
  1. Mark task as "deferred" (not "blocked")
  2. Record failure context in CONTINUE.md
  3. Move to next task in the slice
  4. After all other tasks complete, retry deferred tasks once
  5. If still failing, THEN mark as blocked
```

Changes to `loop.ts`:
- Replace `break` at line 338 with: push to `deferredTasks` array, advance state to next task
- After the main task loop, iterate `deferredTasks` with fresh context
- Only `break` if deferred retry also fails

**Impact:** A transient failure (test crosstalk, timing issue, context truncation) no longer kills the entire session. The loop continues with other tasks and comes back.

---

## 4. Smarter Retry with Context Rotation

### The Problem
When GREEN fails 3 times, the Doctor is invoked with the same compressed context as the original attempt. Doctor diagnosis quality suffers from the same context limitations that caused the failure.

### Proposal: Progressive context enrichment on retry

Each retry gets a slightly different context strategy:

| Attempt | Context Strategy |
|---------|-----------------|
| 1 | Normal context (current behavior) |
| 2 | Add full test output from attempt 1 to context |
| 3 | Expand context budget to 1.5x (override pressure tier) |
| Doctor | Full context (ignore pressure tier entirely) + error history from all 3 attempts |

Changes:
- `loop.ts` retry logic passes attempt number to `assembleContext`
- `context.ts` accepts optional `contextOverrideMultiplier` that overrides pressure-based multiplier
- Doctor prompt includes structured failure history, not just the latest error

**Impact:** Later retries have more information, not less. Doctor gets the full picture.

---

## 5. Pre-flight Validation Before Execution

### The Problem
The orchestrator discovers problems (wrong file paths, missing dependencies, malformed plans) only AFTER invoking Claude — wasting a full invocation cycle. Examples:
- Task plan says `src/cards/card.repo.ts` but code lives at `playground/src/cards/card.repo.ts`
- TDD Sequence lists test files that don't match the artifact paths
- Missing upstream artifacts that a task depends on

### Proposal: Pre-flight checks before Claude invocation

Before building the prompt, run fast deterministic checks:

```
Pre-flight checklist:
1. All upstream task SUMMARYs exist (dependency check)
2. All artifact paths in the plan resolve to valid parent directories
3. TDD Sequence test paths are consistent with artifact paths
4. Required imports reference files that exist (from upstream tasks)
5. Vault docs referenced in plan exist
```

If pre-flight fails:
- Log the issue
- Auto-fix if possible (e.g., prepend `playground/` to bare `src/` paths)
- Skip to next task if not fixable

Changes:
- New function `preflight(projectRoot, state, taskPlan): PreflightResult` in `verify.ts`
- Called in `loop.ts` between context assembly and prompt building
- Returns `{ok: boolean, fixes: AutoFix[], blockers: string[]}`

**Impact:** Catches plan errors before spending tokens. Auto-fixes the most common path prefix issue.

---

## 6. Review Issues Should Have Teeth (Or Not Exist)

### The Problem
Slice completion runs a reviewer quality gate that found 8 MUST-FIX issues on S01 and 7 on S02. These were logged but didn't block completion and were never addressed. This is the worst outcome: overhead without value.

### Proposal: Binary choice — enforce or skip

**Option A (enforce):** MUST-FIX issues create remediation tasks that the orchestrator auto-schedules before advancing to the next slice. The reviewer becomes a real quality gate.

**Option B (skip under pressure):** At GREEN/YELLOW budget tiers, review runs and creates remediation tasks. At ORANGE/RED tiers, review is skipped entirely (current behavior at RED, extend to ORANGE). No review is better than ignored review.

**Recommendation:** Option A for `tdd-strict` tasks, Option B for `test-after` and `verify-only` tasks. Infrastructure code doesn't need 6-persona review.

Changes:
- `loop.ts` COMPLETE_SLICE handler: if review finds MUST-FIX issues, create task plans for fixes and re-enter EXECUTE_TASK
- Budget pressure determines max remediation tasks (GREEN: unlimited, YELLOW: 3, ORANGE: 0)
- Track remediation separately in session metrics

**Impact:** Review either catches real issues (and they get fixed) or doesn't waste tokens.

---

## 7. Adaptive Prompt Length Based on Task Complexity

### The Problem
Every task gets the same prompt structure regardless of complexity. A simple "add a column to a table" task gets the same vault docs, upstream summaries, and code files as a complex "implement JWT auth with middleware." This wastes context window and can cause the agent to over-engineer simple tasks.

### Proposal: Task complexity scoring drives prompt assembly

PLAN_SLICE assigns a complexity tier to each task:

| Tier | Prompt Strategy | Example |
|------|----------------|---------|
| `simple` | Minimal: task plan + directly relevant code files only | Add field to model, create basic route |
| `standard` | Normal: task plan + upstream summaries + relevant code | Implement service layer with validation |
| `complex` | Full: everything including vault docs + extra context | Auth system, complex business logic |

Changes:
- `plan-parser.ts` extracts `complexity: simple | standard | complex`
- `context.ts` uses complexity to filter what gets included
- `prompt-builder.ts` adjusts instruction verbosity

**Impact:** Simple tasks execute faster with less noise. Complex tasks get full context.

---

## 8. One Failing Test Should Not Block Progress

### The Problem
There's currently 1 failing test (auth middleware expired token) out of 154. This test likely fails due to a timing/expiry edge case. During full suite verification at COMPLETE_SLICE, this one failure could block the entire slice.

### Proposal: Distinguish regressions from pre-existing failures

Before running full suite at COMPLETE_SLICE, snapshot the current failure set:

```
1. Run full suite BEFORE slice work begins → record "baseline failures"
2. Run full suite AFTER slice work completes → record "current failures"
3. New failures = current - baseline
4. Only NEW failures block slice completion
```

Changes:
- At PLAN_SLICE, run `bun test` and save results to `slices/SXX/BASELINE_TESTS.json`
- At COMPLETE_SLICE, compare against baseline
- Only fail if there are NEW test failures not in the baseline

**Impact:** Pre-existing failures don't block forward progress. Regressions are still caught.

---

## 9. Streaming Error Context to Doctor

### The Problem
Doctor agent diagnoses are sometimes truncated ("The i..."). The Doctor gets the same context as the implementer, making its diagnosis only as good as the original attempt.

### Proposal: Structured error handoff to Doctor

Create a structured `ERROR_CONTEXT.md` for the Doctor with:

```markdown
## Failed Task: S03/T02
## Phase: IMPLEMENT (GREEN)
## Attempts: 3

### Attempt 1
- Test output: [full bun test stderr/stdout]
- Files modified: [list]
- Error pattern: [classified]

### Attempt 2
...

### Attempt 3
...

### Test Isolation Check
- Per-file results: [pass/fail per file]
- Full suite results: [pass/fail summary]
- Difference: [which tests fail only in suite]
```

Changes:
- `loop.ts` accumulates attempt results in a structured array
- Before Doctor invocation, write `ERROR_CONTEXT.md` to the task directory
- Doctor prompt references this file explicitly
- Doctor output is captured fully (increase timeout, don't truncate)

**Impact:** Doctor has structured, complete information. Diagnoses are actionable.

---

## 10. Session Continuity Without Cold Start

### The Problem
Every new session starts from scratch: read state, build context, invoke Claude. If the previous session was stuck on a task, the new session has no memory of what was tried and what failed. It just retries the same thing — and sometimes succeeds due to non-determinism, not because anything changed.

### Proposal: CONTINUE.md as a first-class context source

CONTINUE.md already exists for crash recovery but isn't always populated. Make it systematic:

- At end of every session (not just crashes), write CONTINUE.md with:
  - What was accomplished this session
  - What was attempted but failed (with brief reason)
  - What the next session should try differently
- `context.ts` always loads CONTINUE.md into the prompt if it exists
- After successful task completion, delete CONTINUE.md (already implemented)

Changes:
- `session.ts` `endSession()` writes CONTINUE.md for the current task
- `context.ts` `assembleContext()` includes CONTINUE.md content
- `prompt-builder.ts` adds "Previous session notes" section if CONTINUE.md exists

**Impact:** New sessions pick up where old ones left off instead of blindly retrying.

---

## Priority Matrix

| Proposal | Impact | Effort | Priority |
|----------|--------|--------|----------|
| 1. Task-Level TDD Classification | High | Medium | **P0** — largest source of friction |
| 2. Test Isolation | High | Low | **P0** — root cause of S03 stuck states |
| 3. Skip-and-Continue | High | Low | **P1** — prevents hard stops |
| 4. Context Rotation on Retry | Medium | Low | **P1** — improves retry success rate |
| 5. Pre-flight Validation | Medium | Medium | **P1** — prevents wasted invocations |
| 6. Review Enforcement | Medium | Medium | **P2** — quality vs velocity tradeoff |
| 7. Adaptive Prompt Length | Low | Medium | **P2** — optimization, not a blocker |
| 8. Baseline Test Tracking | Medium | Low | **P1** — prevents false blocks |
| 9. Structured Doctor Handoff | Medium | Low | **P1** — improves diagnosis quality |
| 10. Session Continuity | Medium | Low | **P2** — nice-to-have, partially exists |

---

## Recommended Implementation Order

**Phase A (unblock the critical path):**
1. Task-Level TDD Classification (#1)
2. Test Isolation (#2)
3. Skip-and-Continue (#3)

**Phase B (improve retry quality):**
4. Context Rotation (#4)
5. Baseline Test Tracking (#8)
6. Structured Doctor Handoff (#9)

**Phase C (polish):**
7. Pre-flight Validation (#5)
8. Review Enforcement (#6)
9. Session Continuity (#10)
10. Adaptive Prompt Length (#7)
