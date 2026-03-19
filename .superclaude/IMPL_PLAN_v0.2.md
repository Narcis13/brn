# Implementation Plan: One-Shot TDD + Structured State Formats

**Version:** 0.2.0
**Status:** Draft — pending human approval
**Scope:** Two systemic changes to the orchestrator based on real execution observations

---

## Background

After babysitting M001/S01/T01 through the full RED → GREEN → REFACTOR → VERIFY cycle, two issues surfaced:

1. **4 separate Claude invocations per task** is expensive and fragile. Each sub-phase gets its own headless `claude -p` call with fresh context assembly. The GREEN agent re-reads tests it didn't write. The REFACTOR agent re-reads code it didn't write. For context-window-sized tasks (the design constraint), one invocation can do all three.

2. **Markdown frontmatter parsing with regex** is brittle for machine state. The orchestrator reads STATE.md every loop iteration using `parseFrontmatter()` — a regex-based key:value extractor. A malformed line blocks the entire loop. Similarly, task status is embedded in PLAN.md frontmatter alongside human-readable content, mixing concerns.

---

## Change 1: One-Shot Task Execution

### What Changes

**Before:** `EXECUTE_TASK` cycles through 4 TDD sub-phases, each a separate Claude invocation:
```
RED (invoke claude) → enforce tests fail
GREEN (invoke claude) → enforce tests pass
REFACTOR (invoke claude) → enforce tests still pass
VERIFY (mechanical) → static checks + full suite
```
That's **3 Claude invocations + 1 mechanical step** per task. Cost: 3x context assembly, 3x prompt generation, 3x headless spawns.

**After:** `EXECUTE_TASK` makes **1 Claude invocation** with a unified TDD prompt, followed by **1 mechanical verification step**:
```
IMPLEMENT (invoke claude) → write tests + implement + refactor in one shot
VERIFY (mechanical) → enforce tests pass + static checks + full suite + review
```
That's **1 Claude invocation + 1 mechanical step** per task. ~3x cost reduction.

### Why This Is Safe

The spec says (P9): "Human Reviews Outcomes, Not Process." TDD discipline is enforced by **verifying outcomes**, not by **controlling process**:

- Tests exist? → Static check (file existence)
- Tests pass? → `bun test`
- Implementation has substance? → Static check (min lines, no stubs, required exports)
- Imports wired? → Static check (import detection)
- Types correct? → `bunx tsc --noEmit`

All of these checks already exist in the VERIFY phase. The agent still receives TDD instructions ("write tests first, then implement, then refactor") — it just does all three in one context window where it has full coherence.

### Files to Modify

#### 1. `types.ts` — Simplify TDD sub-phases

```typescript
// BEFORE
export type TDDSubPhase = "RED" | "GREEN" | "REFACTOR" | "VERIFY";

// AFTER
export type TDDSubPhase = "IMPLEMENT" | "VERIFY";
```

Keep the type name `TDDSubPhase` to minimize blast radius. The IMPLEMENT phase replaces RED+GREEN+REFACTOR. VERIFY remains mechanical.

Also add a new type for the execution mode toggle:

```typescript
export type ExecutionMode = "one-shot" | "phased";
```

#### 2. `state.ts` — Simplify TDD advancement

**`advanceTDDPhase()`:**
```typescript
// BEFORE: RED → GREEN → REFACTOR → VERIFY → null
// AFTER:  IMPLEMENT → VERIFY → null

export function advanceTDDPhase(current: TDDSubPhase | null): TDDSubPhase | null {
  switch (current) {
    case null:
    case "IMPLEMENT":
      return "VERIFY";
    case "VERIFY":
      return null; // Task complete
  }
}
```

**`handleExecuteTask()`:**
```typescript
// BEFORE: 4 cases (RED, GREEN, REFACTOR, VERIFY)
// AFTER: 2 cases (IMPLEMENT, VERIFY)

function handleExecuteTask(state: ProjectState): NextAction {
  switch (state.tddSubPhase) {
    case null:
    case "IMPLEMENT":
      return { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", description: "Implement task (TDD one-shot)" };
    case "VERIFY":
      return { phase: "EXECUTE_TASK", tddSubPhase: "VERIFY", description: "Run comprehensive verification" };
    default:
      return { phase: "EXECUTE_TASK", tddSubPhase: "IMPLEMENT", description: "Unknown TDD sub-phase — start IMPLEMENT" };
  }
}
```

**`determineNextActionEnhanced()` — PLAN_SLICE case:**
Change the initial TDD sub-phase from `"RED"` to `"IMPLEMENT"`:
```typescript
// Line ~229: tddSubPhase: "RED" → tddSubPhase: "IMPLEMENT"
return {
  phase: "EXECUTE_TASK",
  tddSubPhase: "IMPLEMENT",  // was "RED"
  description: `Slice planned — execute ${planSliceId}/${nextTask}`,
  slice: planSliceId,
  task: nextTask,
};
```

#### 3. `prompt-builder.ts` — Unified TDD prompt

**Replace** `buildRedPrompt()`, `buildGreenPrompt()`, `buildRefactorPrompt()` with a single `buildImplementPrompt()`:

```typescript
function buildExecuteTaskPrompt(
  tddSubPhase: TDDSubPhase | null,
  ctx: ContextPayload
): string {
  switch (tddSubPhase) {
    case "IMPLEMENT":
      return buildImplementPrompt(ctx);
    case "VERIFY":
      return buildVerifyPrompt(ctx);
    default:
      return buildImplementPrompt(ctx);
  }
}
```

**New `buildImplementPrompt()`** — the core of this change:

```typescript
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
```

**Keep `buildVerifyPrompt()` as-is** — it's already minimal and mechanical.

#### 4. `loop.ts` — Simplify the execution flow

**`computeNextState()`** — remove the `skipRefactor` parameter:

```typescript
// BEFORE
export function computeNextState(current, action, skipRefactor = false)
  // ... skipRefactor logic to jump REFACTOR → VERIFY

// AFTER
export function computeNextState(current, action)
  // ... just advance: IMPLEMENT → VERIFY → null (task complete)
```

The `skipRefactor` param and the budget-pressure skip logic become dead code since REFACTOR is no longer a separate phase.

**TDD enforcement section (line ~307-347):**

The current code runs `enforceTDDPhase()` which dispatches to `enforceRed()`, `enforceGreen()`, `enforceRefactor()`, `enforceVerify()`. After this change:

- `IMPLEMENT` phase: Run `enforceImplement()` — tests must exist AND pass (combines RED's "tests exist" with GREEN's "tests pass")
- `VERIFY` phase: Unchanged — runs full test suite + static verification

```typescript
// In the TDD enforcement section:
if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "IMPLEMENT") {
  const tddResult = await enforceTDDPhase("IMPLEMENT", projectRoot, taskPlan.tddSequence);
  // ... retry logic stays the same, but now retries the full one-shot
}
```

**Git commit section (line ~431-446):**

Change the commit label from sub-phase-specific to unified:

```typescript
// BEFORE: feat(S01/T01): [red|green|refactor]
// AFTER:  feat(S01/T01): [implement] description

if (currentState.tddSubPhase === "IMPLEMENT") {
  await commitTDDPhase(projectRoot, sliceId, taskId, "implement", description);
}
// VERIFY doesn't commit (it's mechanical verification, no new code)
```

This means **1 commit per task** instead of 3. The commit represents the complete TDD implementation.

**Checkpoint section (line ~229-237):**

Change `tddSubPhase === "RED"` to `tddSubPhase === "IMPLEMENT"`:

```typescript
if (currentState.phase === "EXECUTE_TASK" && currentState.tddSubPhase === "IMPLEMENT" && ...) {
  await createCheckpoint(...);
}
```

**Agent role mapping (`getAgentRoleForPhase()`):**

```typescript
case "EXECUTE_TASK":
  if (tddSubPhase === "IMPLEMENT") return "implementer";
  return null; // VERIFY is mechanical
```

#### 5. `tdd.ts` — Add `enforceImplement()`

```typescript
export async function enforceTDDPhase(
  phase: TDDSubPhase,
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  switch (phase) {
    case "IMPLEMENT":
      return enforceImplement(projectRoot, sequence);
    case "VERIFY":
      return enforceVerify(projectRoot, sequence);
  }
}

/**
 * One-shot enforcement: tests must exist AND pass.
 * Replaces the old RED (exist+fail) → GREEN (pass) → REFACTOR (still pass) chain.
 */
async function enforceImplement(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  // 1. Test files must exist
  const testFiles = await findTestFiles(projectRoot, sequence);
  if (testFiles.length === 0) {
    return {
      passed: false,
      phase: "IMPLEMENT",
      message: "IMPLEMENT phase produced no test files — agent must write tests first.",
      testResult: null,
    };
  }

  // 2. Tests must PASS (agent wrote tests + implementation in one shot)
  const testResult = await runTests(projectRoot, testFiles);
  if (!testResult.passing) {
    return {
      passed: false,
      phase: "IMPLEMENT",
      message: `IMPLEMENT phase: ${testResult.failedTests} test(s) still failing. Agent must fix implementation.`,
      testResult,
    };
  }

  return {
    passed: true,
    phase: "IMPLEMENT",
    message: `IMPLEMENT OK: ${testFiles.length} test file(s), all ${testResult.totalTests} test(s) passing.`,
    testResult,
  };
}
```

Remove `enforceRed()`, `enforceGreen()`, `enforceRefactor()`. Keep `enforceVerify()` unchanged.

#### 6. `budget-pressure.ts` — Remove REFACTOR skip logic

```typescript
// Remove: shouldSkipRefactor() — no longer needed
// Remove: allowRefactor from PressurePolicy — no longer needed
```

#### 7. Test files — Update all TDD-related tests

Files to update:
- `tdd.test.ts` — Replace RED/GREEN/REFACTOR test cases with IMPLEMENT test cases
- `state.test.ts` — Update `advanceTDDPhase` tests: IMPLEMENT → VERIFY → null
- `loop.test.ts` — Update `computeNextState` tests for new sub-phases
- `prompt-builder.test.ts` — Replace RED/GREEN/REFACTOR prompt tests with IMPLEMENT prompt test
- `budget-pressure.test.ts` — Remove `shouldSkipRefactor` tests

### Migration for In-Progress State

The current STATE.md has `tdd_sub_phase: VERIFY` for T01 (already completing). For T02, the orchestrator will start fresh with `IMPLEMENT`. We need a compatibility shim in `readState()`:

```typescript
// Temporary migration: map old sub-phases to new ones
function migrateSubPhase(raw: string | null): TDDSubPhase | null {
  if (!raw || raw === "null") return null;
  // Old phases map to new ones
  if (raw === "RED" || raw === "GREEN" || raw === "REFACTOR") return "IMPLEMENT";
  if (raw === "VERIFY") return "VERIFY";
  if (raw === "IMPLEMENT") return "IMPLEMENT";
  return null;
}
```

This shim can be removed after M001 completes.

---

## Change 2: Structured State Formats

### The Principle

**If the orchestrator parses it programmatically every loop → structured format (YAML/JSON).**
**If it's injected as text into a prompt → markdown is fine.**

### What Changes

#### A. `STATE.md` → `state.yaml`

**The most critical change.** STATE is read/written every loop iteration. Parse failure = dead loop.

**Before (STATE.md):**
```markdown
---
phase: EXECUTE_TASK
tdd_sub_phase: VERIFY
milestone: M001
slice: S01
task: T01
last_updated: 2026-03-19T16:48:57.499Z
---

## Current Position

- **Phase:** EXECUTE_TASK
- **Milestone:** M001
...
```

Parsed by regex: `content.match(/^---\n([\s\S]*?)\n---/)` → line-by-line `key: value` extraction.

**After (`state.yaml`):**
```yaml
phase: EXECUTE_TASK
tddSubPhase: VERIFY
milestone: M001
slice: S01
task: T01
lastUpdated: "2026-03-19T16:48:57.499Z"
```

No frontmatter fences. No markdown body. Pure YAML. Parsed by a proper YAML parser (or even `JSON.parse` if we use JSON).

**Decision: YAML or JSON?**

Use **JSON** for `state.json`. Rationale:
- `JSON.parse()` is built-in, zero dependencies, zero edge cases
- Humans rarely hand-edit state (it's machine-managed)
- No YAML library needed (Bun doesn't have one built-in)
- Avoids YAML gotchas (Norway problem, boolean coercion, implicit types)

**After (`state.json`):**
```json
{
  "phase": "EXECUTE_TASK",
  "tddSubPhase": "VERIFY",
  "milestone": "M001",
  "slice": "S01",
  "task": "T01",
  "lastUpdated": "2026-03-19T16:48:57.499Z"
}
```

### Files to Modify

#### 1. `types.ts` — Update PATHS constant

```typescript
// BEFORE
stateFile: ".superclaude/state/STATE.md",

// AFTER
stateFile: ".superclaude/state/state.json",
```

#### 2. `state.ts` — Replace frontmatter parsing with JSON

**`readState()`:**
```typescript
export async function readState(projectRoot: string): Promise<ProjectState> {
  const path = `${projectRoot}/${PATHS.stateFile}`;
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = await file.json();
    return {
      phase: (raw.phase as Phase) ?? "IDLE",
      tddSubPhase: raw.tddSubPhase ?? null,
      currentMilestone: raw.milestone ?? null,
      currentSlice: raw.slice ?? null,
      currentTask: raw.task ?? null,
      lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    // JSON parse failed — return default state rather than crashing
    console.error(`[SUPER_CLAUDE] Failed to parse state.json — resetting to IDLE`);
    return { ...DEFAULT_STATE };
  }
}
```

**`writeState()`:**
```typescript
export async function writeState(projectRoot: string, state: ProjectState): Promise<void> {
  const path = `${projectRoot}/${PATHS.stateFile}`;
  const data = {
    phase: state.phase,
    tddSubPhase: state.tddSubPhase,
    milestone: state.currentMilestone,
    slice: state.currentSlice,
    task: state.currentTask,
    lastUpdated: new Date().toISOString(),
  };
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}
```

**Remove:** `parseFrontmatter()` and `toFrontmatter()` helper functions from state.ts (dead code after this change).

**Keep:** `parseFrontmatter()` is also used by `plan-parser.ts` for task plans. Those stay as markdown (they're prompt-injected, not machine state). So extract `parseFrontmatter` to a shared utility if it's imported elsewhere, or keep a copy in plan-parser.ts.

#### 3. `auto.lock` — Already JSON (no change needed)

The lock file is already JSON:
```json
{
  "milestone": "M001",
  "slice": "S01",
  "task": "T01",
  "pid": 9856,
  "startedAt": "2026-03-19T17:04:03.739Z"
}
```

No change needed here.

#### 4. `.gitignore` — Update tracked state file reference

```gitignore
# BEFORE
.superclaude/state/STATE.md

# AFTER
.superclaude/state/state.json
```

Wait — actually the current `.gitignore` says `.superclaude/state/STATE.md` is ignored, but there's a recent commit `fix: track STATE.md in git so orchestrator state survives across machines`. Check what the current intent is. If STATE should be tracked (survives across machines), then state.json should also be tracked. If not, add it to .gitignore.

**Action:** Match the current git tracking behavior. If STATE.md is tracked, track state.json. If ignored, ignore state.json.

#### 5. Migration — One-time conversion

Add a migration check in `readState()`:

```typescript
export async function readState(projectRoot: string): Promise<ProjectState> {
  const jsonPath = `${projectRoot}/${PATHS.stateFile}`;  // state.json
  const legacyPath = `${projectRoot}/.superclaude/state/STATE.md`;

  // Try JSON first
  const jsonFile = Bun.file(jsonPath);
  if (await jsonFile.exists()) {
    // ... normal JSON parsing
  }

  // Fallback: migrate from STATE.md
  const legacyFile = Bun.file(legacyPath);
  if (await legacyFile.exists()) {
    const content = await legacyFile.text();
    const state = parseLegacyState(content);  // old frontmatter parser
    // Write as JSON for future reads
    await writeState(projectRoot, state);
    return state;
  }

  return { ...DEFAULT_STATE };
}
```

This auto-migrates STATE.md → state.json on first read. After migration, the loop writes state.json going forward.

#### 6. Tests — Update state.test.ts

- Replace frontmatter parsing tests with JSON parsing tests
- Test the migration path (STATE.md → state.json)
- Test parse failure recovery (malformed JSON → DEFAULT_STATE)

#### 7. Other files that reference STATE.md

Search for `STATE.md` references across the codebase and update:
- `CLAUDE.md` — Update key paths documentation
- `SUPER_CLAUDE.md` — Update file structure and state machine docs (later, not blocking)
- `scaffold.ts` — If it references STATE.md directly
- Dashboard/session files — If they reference the state path

---

## Change 3: Review System Fixes

### Problem 3A: Review Retry Counter Not Persisted (Bug)

The retry counter is an in-memory `Map` inside `runAutoLoop()`:

```typescript
// loop.ts:115-116 — dies with the process
const reviewRetries = new Map<string, number>();
const MAX_REVIEW_RETRIES = 2;
```

In **auto mode**, this works because the `while` loop keeps the map alive. In **step mode**, each invocation creates a fresh `main()` → fresh map → counter always 0. Result: step mode can never exhaust review retries — infinite retry loop.

**Fix:** Persist the retry count in `REVIEW_FEEDBACK.md` frontmatter (it already has `review_attempt: 1`). The orchestrator reads this on VERIFY to know the current attempt count.

#### Files to Modify

**`loop.ts` — Read retry count from disk instead of memory:**

```typescript
// In the reviewer quality gate section:
// BEFORE: const retryCount = reviewRetries.get(taskKey) ?? 0;
// AFTER:
const retryCount = await readReviewAttemptCount(projectRoot, m, s, t);
```

**`scaffold.ts` — Add `readReviewAttemptCount()` helper:**

```typescript
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
```

**Remove:** `reviewRetries` Map and `MAX_REVIEW_RETRIES` from loop.ts local scope. Move `MAX_REVIEW_RETRIES` to `types.ts` as a constant.

After this fix, both auto and step modes read the same disk truth for retry count.

### Problem 3B: Reviewer Scope Creep (Design Flaw)

The current review prompt (`buildReviewPrompt()` in `agents.ts:509-586`) gives persona-specific focus areas but **no boundary on what qualifies as MUST-FIX**. The reviewer judges against general best practices, not the task's must-haves.

Evidence from T01's REVIEW_FEEDBACK.md — 7 MUST-FIX issues, most not in T01's must-haves:

| Review Issue | In Task Must-Haves? | Should Be |
|---|---|---|
| Server not actually started | Debatable | SHOULD-FIX |
| DB instance at module level | No | CONSIDER |
| Missing return type on export | No | SHOULD-FIX |
| Migrations run on every start | No (idempotent by design) | CONSIDER |
| No test for index.ts | No | SHOULD-FIX |
| Env var error cases untested | No | CONSIDER |
| DB init untestable due to side effects | No | CONSIDER |

Each false MUST-FIX triggers a retry cycle (3 extra Claude invocations in phased mode, 1 in one-shot mode). This is the most expensive bug in the system.

**Fix:** Inject the task's must-haves into the review prompt and add a MUST-FIX scoping rule.

#### Files to Modify

**`agents.ts` — `buildReviewPrompt()` — Add must-have boundary:**

Insert after the focus areas section and before the code section:

```typescript
// After line 525 (sections.push(focus))
sections.push("");
sections.push(`## MUST-FIX Boundary (CRITICAL)`);
sections.push(`MUST-FIX means: "This code will not work correctly for its specified purpose."`);
sections.push(`Only flag MUST-FIX for:`);
sections.push(`- Violations of the task's Must-Have Truths (observable behaviors that don't work)`);
sections.push(`- Violations of the task's Must-Have Artifacts (files missing, exports missing, stubs)`);
sections.push(`- Violations of the task's Must-Have Key Links (imports not wired)`);
sections.push(`- Security vulnerabilities (OWASP Top 10)`);
sections.push(`- Code that will crash at runtime (not style issues, not "could be better")`);
sections.push("");
sections.push(`Everything else is SHOULD-FIX or CONSIDER — quality improvements that don't block task completion.`);
sections.push("");
```

This gives the reviewer a clear rubric: MUST-FIX = broken or missing must-haves. Everything else = quality feedback that doesn't trigger retries.

**`agents.ts` — `buildReviewPrompt()` — Extract must-haves from task context:**

The task context is already injected (line 540-544). The must-haves are embedded in the task plan text. No additional extraction needed — the scoping instruction above is sufficient because the reviewer already sees the must-haves in the Task Context section. The instruction just tells it to use them as the MUST-FIX boundary.

### Problem 3C: Review Retry Cost in One-Shot Mode

In the current phased model, a review retry costs:
```
VERIFY fails → rollback to GREEN → GREEN (invoke) → REFACTOR (invoke) → VERIFY (invoke)
= 3 Claude invocations per retry
```

In one-shot mode, a review retry costs:
```
VERIFY fails → rollback to IMPLEMENT → IMPLEMENT (invoke) → VERIFY (mechanical)
= 1 Claude invocation per retry
```

This is automatically handled by Change 1. The retry rollback target changes from `"GREEN"` to `"IMPLEMENT"`:

```typescript
// loop.ts — reviewer retry section
// BEFORE:
const rollbackState = { ...currentState, tddSubPhase: "GREEN" as const, ... };

// AFTER:
const rollbackState = { ...currentState, tddSubPhase: "IMPLEMENT" as const, ... };
```

---

## What Does NOT Change

These files stay as markdown because they're human-readable and/or prompt-injected:

| File | Why Markdown |
|---|---|
| `ROADMAP.md` | Injected into PLAN_SLICE prompts as text |
| `PLAN.md` (slice + task) | Injected into EXECUTE_TASK prompts as text |
| `SUMMARY.md` | Injected into upstream context as text |
| `CONTEXT.md` | Injected into planning prompts as text |
| `RESEARCH.md` | Injected into planning prompts as text |
| `UAT.md` | Human-readable acceptance scripts |
| `CONTINUE.md` | Injected into resume prompts as text |
| Vault docs | Obsidian-compatible, human-browsable |

The orchestrator reads these files as text blobs and injects them into prompts. Markdown is the right format for this — the LLM understands markdown natively.

---

## Implementation Order

### Phase A: One-Shot TDD (the risky change — test thoroughly)

1. **A1:** Update `types.ts` — new `TDDSubPhase` values
2. **A2:** Update `state.ts` — `advanceTDDPhase()`, `handleExecuteTask()`, migration shim
3. **A3:** Update `tdd.ts` — `enforceImplement()`, remove old phase enforcers
4. **A4:** Update `prompt-builder.ts` — `buildImplementPrompt()`, remove old phase prompts
5. **A5:** Update `loop.ts` — `computeNextState()`, checkpoint logic, commit logic, agent role mapping
6. **A6:** Update `budget-pressure.ts` — remove `skipRefactor` logic
7. **A7:** Update all test files
8. **A8:** Run `bun test` — all orchestrator tests pass

### Phase B: Structured State (the safe change — mostly plumbing)

1. **B1:** Update `types.ts` — PATHS.stateFile → `state.json`
2. **B2:** Rewrite `state.ts` — JSON read/write, migration from STATE.md
3. **B3:** Update `.gitignore` and `CLAUDE.md` references
4. **B4:** Update test files
5. **B5:** Run `bun test` — all tests pass
6. **B6:** Delete STATE.md after migration confirmed

### Phase C: Review System Fixes (bug fix + design fix)

1. **C1:** Add `readReviewAttemptCount()` to `scaffold.ts`
2. **C2:** Move `MAX_REVIEW_RETRIES` to `types.ts` as exported constant
3. **C3:** Update `loop.ts` — read retry count from disk, remove in-memory map, rollback to `IMPLEMENT` instead of `GREEN`
4. **C4:** Update `agents.ts` — `buildReviewPrompt()` with MUST-FIX scoping boundary
5. **C5:** Update test files for new review behavior
6. **C6:** Run `bun test` — all tests pass

### Phase D: Smoke Test with Real Task (T02)

1. **D1:** Set state.json to `{ "phase": "EXECUTE_TASK", "tddSubPhase": "IMPLEMENT", "milestone": "M001", "slice": "S01", "task": "T02" }`
2. **D2:** Run `bun run .superclaude/orchestrator/loop.ts --mode=step --milestone=M001`
3. **D3:** Verify: One Claude invocation produces both tests + implementation for T02
4. **D4:** Verify: VERIFY phase runs tests, static checks, reviewer
5. **D5:** Verify: Reviewer only flags actual must-have violations as MUST-FIX
6. **D6:** Verify: Single commit `feat(S01/T02): [implement] Password & JWT utilities`
7. **D7:** Verify: State advances to T03
8. **D8:** Verify: Review retry counter persists correctly if run in step mode

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent writes implementation without tests in one-shot | Medium | Medium | `enforceImplement()` checks test files exist AND pass. If no test files → fail + retry. |
| Agent writes trivial tests that don't test real behavior | Low | High | Static verification catches stubs. Reviewer personas catch shallow tests. Must-have truths verify observable behaviors. |
| JSON state parse failure on edge case | Very Low | High | Try/catch with fallback to DEFAULT_STATE. JSON is well-specified — no edge cases like YAML. |
| Legacy STATE.md migration fails | Low | Low | Migration reads frontmatter, writes JSON. Fallback: manually set state.json. |
| Git history loses TDD phase granularity | Low | Low | One commit per task is actually cleaner for `git log`. The TDD sequence is internal process, not something humans review per-commit. |
| Scoped reviewer misses real issues | Low | Medium | Security vulnerabilities are always MUST-FIX regardless of must-haves. Runtime crashes are always MUST-FIX. The boundary only narrows style/design opinions. |
| Review retry count from disk has stale data | Very Low | Low | `clearReviewFeedback()` already deletes REVIEW_FEEDBACK.md on review pass. Fresh task = no file = count 0. |

---

## Success Criteria

After implementation:

- [ ] `bun test` passes all orchestrator tests
- [ ] State reads/writes use JSON (no frontmatter parsing for state)
- [ ] Running the loop on T02 produces 1 Claude invocation (not 3)
- [ ] T02 tests exist and pass after the single invocation
- [ ] Single `feat(S01/T02): [implement]` commit (not 3 separate commits)
- [ ] State correctly advances from T02 → T03
- [ ] Total cost for T02 is ~1/3 of T01's cost
- [ ] Reviewer MUST-FIX is scoped to must-haves + security + runtime crashes
- [ ] Review retry count survives across step-mode invocations
- [ ] Review retry rollback goes to IMPLEMENT (not GREEN)

---

## Appendix: Files Changed Summary

| File | Change Type | Phase | Description |
|---|---|---|---|
| `types.ts` | Modify | A+B | TDDSubPhase: IMPLEMENT/VERIFY, PATHS.stateFile, MAX_REVIEW_RETRIES constant |
| `state.ts` | Rewrite | A+B | JSON read/write, simplified advanceTDDPhase, migration |
| `tdd.ts` | Modify | A | Replace 4 enforcers with 2 (IMPLEMENT + VERIFY) |
| `prompt-builder.ts` | Modify | A | Replace 3 prompts with 1 unified buildImplementPrompt |
| `loop.ts` | Modify | A+C | Simplify computeNextState, checkpoint, commit, agent role, disk-based retry counter |
| `budget-pressure.ts` | Modify | A | Remove skipRefactor |
| `agents.ts` | Modify | C | buildReviewPrompt() — add MUST-FIX scoping boundary |
| `scaffold.ts` | Modify | C | Add readReviewAttemptCount() helper |
| `state.test.ts` | Rewrite | A+B | JSON parsing, new sub-phase tests |
| `tdd.test.ts` | Modify | A | IMPLEMENT enforcement tests |
| `loop.test.ts` | Modify | A+C | computeNextState with new sub-phases, disk retry counter |
| `prompt-builder.test.ts` | Modify | A | buildImplementPrompt tests |
| `budget-pressure.test.ts` | Modify | A | Remove skipRefactor tests |
| `agents.test.ts` | Modify | C | Review prompt scoping tests |
| `scaffold.test.ts` | Modify | C | readReviewAttemptCount tests |
| `.gitignore` | Modify | B | STATE.md → state.json |
| `CLAUDE.md` | Modify | B | Update key paths |
