# BRN: Autonomous Coding Agent

## The Thesis

The failed orchestrator taught us something valuable: **deterministic code is the wrong layer to orchestrate an AI**. Parsing slice IDs with regex, enforcing state transitions with JSON schemas, building context with string concatenation — all of it is fragile scaffolding that does poorly what an AI does naturally: understand context, make judgment calls, and adapt.

The new architecture inverts the stack. Instead of deterministic code calling Claude, **Claude calls Claude**. The orchestrator is an AI that reads the situation, thinks about what needs to happen, crafts the perfect prompt for an executor AI, evaluates the result, and learns from it. No regex. No state machine. No framework code to maintain.

The separation is simple:
- **The Thinker** (Opus, `/next` skill): reads everything, reasons about what to do, crafts prompts, evaluates results, extracts knowledge
- **The Builder** (headless `claude -p`): receives a focused prompt with curated context, writes code, runs tests, returns results
- **The Loop** (`while true`): calls `/next` until done — that's the entire night shift

This works because an AI crafting a prompt for another AI is fundamentally better than code doing it. The Thinker knows what the Builder needs. It knows what context is signal vs. noise. It adapts the prompt style to the task complexity. And it gets better over time because the vault compounds.

---

## Architecture

### The /next Loop

Every `/next` invocation follows this flow:

```
 LOAD ──→ THINK ──→ CRAFT ──→ EXECUTE ──→ VERIFY ──→ LEARN ──→ COMMIT
   │         │         │          │           │          │         │
   │         │         │          │           │          │         │
 state    decide    build      claude -p    tests     vault    git commit
 spec     what &    prompt     with the     types     history  update state
 vault    how big   for the    crafted      lint      steering return
 history  model?    builder    prompt       visual
 steering
 codebase
```

**LOAD**: Read `.brn/state.json`, active spec, relevant vault entries, recent history, steering directives, git status.

**THINK**: What's the current state? What should happen next? How big should this step be? What model fits? What context does the executor need? Is there a steering directive to incorporate?

**CRAFT**: Build a comprehensive prompt for the Builder. Include relevant spec sections, vault knowledge, file contents, constraints. Be specific about expected output. Save prompt to history.

**EXECUTE**: Two modes based on detection:
  - *Attended* (interactive session): work directly using Edit/Write/Bash tools
  - *Unattended* (headless or night shift): run `claude -p` via Bash with crafted prompt, flags, and tool allowlist

**VERIFY**: Run the full quality gauntlet:
  1. `bun test` (or project test command)
  2. `tsc --noEmit` (type check)
  3. `bun build` (bundle check if applicable)
  4. Browser MCP screenshot (if UI changes)
  5. Diff against spec acceptance criteria

**LEARN**: Extract patterns, anti-patterns, and codebase insights. Update vault. Record run in history. If verification failed: extract what went wrong, push to vault anti-patterns, set retry flag (max 1 retry).

**COMMIT**: Stage changes, commit with descriptive message, update `state.json`. If all acceptance criteria are met: create PR, set status to `done`.

### State Model

State is not a rigid machine. It's a living document that the Thinker reads and updates:

```json
{
  "feature": "kanban-board",
  "spec": "feature-kanban-board.md",
  "branch": "feat/kanban-board",
  "status": "implementing",
  "run_count": 5,
  "acceptance_criteria": [
    { "id": "AC1", "text": "Users can sign up with email/password", "met": false },
    { "id": "AC2", "text": "Users can log in and receive JWT", "met": false },
    { "id": "AC3", "text": "Board CRUD with three fixed columns", "met": false },
    { "id": "AC4", "text": "Card CRUD with position ordering", "met": false },
    { "id": "AC5", "text": "React UI at localhost:3000", "met": false }
  ],
  "current_focus": null,
  "last_run": null,
  "retry_count": 0,
  "blocked": false,
  "blocked_reason": null
}
```

The first `/next` call on a new spec:
1. Creates the feature branch
2. Reads the spec
3. Extracts acceptance criteria (AI-generated from spec requirements)
4. Initializes `state.json`
5. Plans the implementation approach
6. Commits the plan and state

Subsequent `/next` calls pick up where the last one left off.

### Knowledge System (Vault)

The vault is the compounding advantage. Every run potentially enriches it. Over time, the Builder gets better prompts because the Thinker has more knowledge to draw from.

```
.brn/vault/
  patterns/              # What works — reusable approaches
    auth-jwt-hono.md     # "JWT auth with Hono middleware pattern"
    sqlite-migrations.md # "Idempotent SQLite migration approach"
  anti-patterns/         # What to avoid — mistakes and fixes
    node-path-bun.md     # "node:path import breaks bun test with happy-dom"
    sqlite-mkdir.md      # "SQLite create:true doesn't create parent dirs"
  decisions/             # Why we chose X over Y
    hono-over-express.md # "Chose Hono because..."
  codebase/              # Living knowledge about this specific codebase
    structure.md         # File structure and conventions
    gotchas.md           # Non-obvious things
```

Each vault entry:
```yaml
---
title: SQLite requires parent directory creation
type: anti-pattern
confidence: verified
source: run-003
created: 2026-03-22
---

## Problem
`new Database(path, { create: true })` creates the .db file but NOT parent
directories. Server crashes with `SQLITE_CANTOPEN` if `data/` doesn't exist.

## Solution
Call `mkdirSync(dirname(dbPath), { recursive: true })` before opening.

## Context
Bun's SQLite binding, not the npm sqlite3 package.
```

**Vault curation rules** (enforced by the Thinker):
- Only store knowledge that isn't obvious from reading the code
- Merge entries about the same topic rather than creating duplicates
- Mark confidence: `speculative` → `verified` (after it helps in a future run)
- Prune entries that haven't been referenced in 10+ runs
- Cap vault size: max 30 entries. If full, remove lowest-confidence entries

### History

History serves three purposes: debugging, context for the Thinker, and learning from past runs.

```
.brn/history/
  runs/
    run-001/
      meta.json           # Timestamps, model, status, duration
      prompt.md           # Exact prompt sent to Builder
      output.md           # Builder's response
      evaluation.md       # Thinker's evaluation of the result
    run-002/
      ...
  index.json              # Summary index for quick scanning
```

`meta.json`:
```json
{
  "id": "run-001",
  "timestamp": "2026-03-22T10:00:00Z",
  "status": "success",
  "phase": "implementing",
  "focus": "auth signup endpoint",
  "model": "sonnet",
  "effort": "high",
  "duration_ms": 45000,
  "tests_passed": true,
  "types_clean": true,
  "commit": "abc1234",
  "acceptance_criteria_met": ["AC1"],
  "vault_updates": ["anti-patterns/sqlite-mkdir.md"],
  "retry": false
}
```

**History windowing**: The Thinker only loads the last 5 runs into context. Older runs are available but not automatically included. The `index.json` gives a scannable summary of all runs.

### Steering

`.brn/steering.md` is a shared notepad between you and the agent:

```markdown
# Steering

## Active
- Use Postgres instead of SQLite
- Skip the mobile-responsive layout for now

## Acknowledged
- ~~Prioritize auth before CRUD~~ (applied in run-002)
```

**How it works**:
- You write directives in the `## Active` section at any time
- The Thinker reads this at the start of every `/next` run
- After incorporating a directive, it moves it to `## Acknowledged` with a note
- If a directive contradicts the spec, the Thinker flags it but follows the directive (you're the boss)
- If the Thinker is about to make a judgment call and steering is empty, it decides autonomously

---

## Night Shift Mode

The night shift loop is trivially simple because all intelligence lives in `/next`:

```bash
#!/bin/bash
# .brn/nightshift.sh

echo "Starting night shift..."
echo "Feature: $(jq -r '.feature' .brn/state.json)"
echo "Status:  $(jq -r '.status' .brn/state.json)"
echo ""

while true; do
  echo "[$(date '+%H:%M:%S')] Running /next..."

  claude -p \
    --model opus \
    --effort high \
    --dangerously-skip-permissions \
    --max-turns 100 \
    "/next" 2>&1 | tee -a .brn/nightshift.log

  # Read state from disk (the skill updates it)
  status=$(jq -r '.status' .brn/state.json 2>/dev/null)
  blocked=$(jq -r '.blocked' .brn/state.json 2>/dev/null)

  if [ "$status" = "done" ]; then
    echo "[$(date '+%H:%M:%S')] Feature complete! PR created."
    # Optional: send notification
    osascript -e 'display notification "Night shift complete!" with title "BRN"' 2>/dev/null
    break
  fi

  if [ "$blocked" = "true" ]; then
    reason=$(jq -r '.blocked_reason' .brn/state.json 2>/dev/null)
    echo "[$(date '+%H:%M:%S')] BLOCKED: $reason"
    echo "Add steering directives to .brn/steering.md to unblock."
    # Wait and check periodically
    sleep 300
    continue
  fi

  echo "[$(date '+%H:%M:%S')] Run complete. Sleeping 10s..."
  sleep 10
done
```

### Safety Rails

1. **Max retry = 1**: If a step fails, the Thinker retries once with lessons learned. If it fails again, it moves on or blocks.
2. **Max runs per feature = 50**: Hard cap to prevent runaway loops. Configurable in state.
3. **Commit gate**: Every successful step commits. If the codebase is broken, `git revert` is always possible.
4. **Branch isolation**: All work happens on a feature branch. Main is never touched.
5. **Block on ambiguity**: If the Thinker can't determine the right course of action, it sets `blocked: true` and waits for steering.
6. **Test gate**: Never commit code that fails tests (unless the Thinker explicitly decides to commit a WIP with a note).

---

## Quality Gates

Every `/next` run passes through these gates before committing:

| Gate | Command | Failure Action |
|------|---------|----------------|
| Tests | `bun test` | Fix and retry (1x), then block |
| Types | `tsc --noEmit` | Fix type errors, retry |
| Build | `bun build` | Fix build errors, retry |
| Visual | Browser MCP screenshot | Compare against spec, flag issues |
| Spec | Diff vs acceptance criteria | Update criteria status |

The Thinker decides which gates apply to each run. A backend-only change skips the visual check. A refactor might skip the spec check.

---

## Model Selection Strategy

The Thinker selects models for the Builder based on task:

| Task Type | Model | Effort | Rationale |
|-----------|-------|--------|-----------|
| Architecture/planning | opus | high | Needs deep reasoning |
| Feature implementation | sonnet | high | Fast, strong at code |
| Complex debugging | opus | high | Needs thorough analysis |
| Simple fix/refactor | sonnet | medium | Speed matters more |
| Test writing | sonnet | high | Structured, pattern-based |
| Visual/UI work | opus | high | Design judgment needed |

In the executor's `claude -p` invocation:
```bash
claude -p \
  --model "$selected_model" \
  --effort "$selected_effort" \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob" \
  --dangerously-skip-permissions \
  --max-turns "$calculated_max_turns" \
  --system-prompt-file ".brn/history/runs/$run_id/prompt.md" \
  "Execute the task described in the system prompt."
```

---

## Directory Structure

```
.brn/
  state.json                # Current feature state
  steering.md               # Human steering directives
  nightshift.sh             # Night shift loop script
  specs/                    # Feature specifications (human-written)
    feature-kanban-board.md
    feature-dashboard.md
  vault/                    # Compounding knowledge base
    patterns/
    anti-patterns/
    decisions/
    codebase/
  history/                  # Run history
    runs/
      run-001/
        meta.json
        prompt.md
        output.md
        evaluation.md
      run-002/
        ...
    index.json              # Quick-scan summary
  skills/                   # The skills themselves
    next/
      SKILL.md              # The /next skill
    status/
      SKILL.md              # The /status skill
    steer/
      SKILL.md              # The /steer skill
    nightshift/
      SKILL.md              # The /nightshift skill
```

---

## Skills Breakdown

### /next — The Core Loop

The primary skill. Each invocation advances the feature by one step.

**Invocation**: `/next` (interactive) or `claude -p "/next"` (headless)

**Arguments**: None. All context comes from disk (state, spec, vault, history, steering).

**Behavior**:
1. If no `state.json` exists: look for specs in `.brn/specs/`, pick the one with `status: ready`, initialize the feature.
2. If `state.json` exists with `status: done`: report completion, do nothing.
3. If `state.json` exists with `status: blocked`: check steering for unblock directives.
4. Otherwise: execute one step of the LOAD → THINK → CRAFT → EXECUTE → VERIFY → LEARN → COMMIT loop.

### /status — Progress Dashboard

**Invocation**: `/status`

**Behavior**: Reads `state.json` and `history/index.json`, displays:
- Current feature and branch
- Acceptance criteria checklist (met/unmet)
- Run count and last run summary
- Vault size and recent additions
- Steering directives (active/acknowledged)
- Estimated progress percentage

### /steer — Add Steering Directive

**Invocation**: `/steer use Postgres instead of SQLite`

**Behavior**: Appends the argument to the `## Active` section of `steering.md`.

### /nightshift — Start Autonomous Loop

**Invocation**: `/nightshift`

**Behavior**: Launches `.brn/nightshift.sh` in the background, shows PID, explains how to monitor and stop.

---

## Implementation Plan

### Phase 1: Foundation (the skeleton)

**Goal**: `.brn/` directory structure, `state.json` management, spec loading.

**Deliverables**:
- `.brn/` directory with all subdirectories
- `state.json` schema and initialization logic
- Spec reader (parse frontmatter + markdown)
- Acceptance criteria extraction from spec
- Git branch creation for features
- `/next` skill skeleton that loads context and reports what it sees
- `/status` skill

**Verification**: Run `/next` on the kanban spec → it initializes state, extracts criteria, creates branch, reports plan. Run `/status` → it shows the initialized state.

### Phase 2: The Core Loop

**Goal**: `/next` executes one step end-to-end.

**Deliverables**:
- Prompt crafting logic (the Thinker builds a prompt for the Builder)
- `claude -p` execution via Bash tool with model/effort/tools selection
- Output capture and logging to history
- Test/type/build verification
- Git commit on success
- State update (acceptance criteria tracking)
- Retry logic (max 1 retry with learnings)
- Attended mode (direct execution without `claude -p`)

**Verification**: Run `/next` repeatedly on the kanban spec → each run produces a commit, advances the feature, updates state. After ~10-15 runs, the feature should be substantially implemented.

### Phase 3: Knowledge System

**Goal**: Vault reads and writes, history windowing, knowledge extraction.

**Deliverables**:
- Vault CRUD (create, read, update, merge, prune)
- Knowledge extraction after each run (patterns, anti-patterns)
- History index and windowing (last 5 runs in context)
- Vault inclusion in executor prompts (relevant entries only)
- Confidence tracking and vault curation

**Verification**: After 10+ runs, the vault should contain 3-5 genuinely useful entries. The executor prompts should reference vault knowledge. Repeated mistakes should not recur.

### Phase 4: Night Shift & Polish

**Goal**: Autonomous loop, steering, visual verification, PR creation.

**Deliverables**:
- `nightshift.sh` script
- `/nightshift` skill to launch it
- `/steer` skill
- Steering read/acknowledge cycle
- Browser MCP integration for visual checks
- PR creation when feature is done
- Blocked state and unblock flow
- Safety rails (max runs, max retries)

**Verification**: Start night shift on a small feature → it runs autonomously, creates commits, and either completes with a PR or blocks with a clear reason. Steering directives mid-run are incorporated.

### Phase 5: Hardening

**Goal**: Battle-test on real features, fix failure modes.

**Deliverables**:
- Run on 3+ diverse features (backend API, frontend UI, full-stack)
- Fix failure modes discovered during testing
- Tune prompt crafting based on what produces good results
- Tune vault curation rules
- Document the system in a README

---

## Self-Awareness Notes

Things I (Claude) know about myself that shaped this design:

1. **I work best with focused prompts**. The Thinker/Builder separation ensures the Builder gets exactly the context it needs, not a dump of everything.

2. **Fresh context windows help me focus**. Using `claude -p` for execution gives the Builder a clean slate every time. No accumulated confusion from previous steps.

3. **I'm prone to scope creep**. The single-step design of `/next` naturally bounds each execution. The acceptance criteria keep me honest about what "done" means.

4. **I degrade with noise**. The vault curation rules (max 30 entries, confidence levels, pruning) prevent context pollution. The history window (last 5 runs) prevents context bloat.

5. **I learn from examples better than rules**. Vault entries should include concrete code examples, not abstract guidelines.

6. **I sometimes lose the big picture in long sessions**. The state on disk IS the big picture. Every `/next` invocation starts by reading it fresh.

7. **My best work happens when I understand the "why"**. The spec format includes user stories and rationale, not just requirements. The vault includes "why" in decisions.

---

## What This Replaces

| Old (SUPER_CLAUDE) | New (BRN) |
|---------------------|-----------|
| Deterministic orchestrator in TypeScript | AI orchestrator via `/next` skill |
| Regex-parsed slice/task IDs | AI reads and understands structure |
| Rigid Milestone → Slice → Task hierarchy | Flexible acceptance criteria |
| State machine with fixed transitions | State on disk, AI decides transitions |
| String-concatenated prompts | AI-crafted prompts with curated context |
| Framework code to maintain | Single skill file to maintain |
| Verbose logging and dashboards | Simple `state.json` + `/status` |
| Manual vault curation | AI extracts and curates knowledge |

The entire "deterministic layer" collapses into one insight: **let the AI be the orchestrator**.
