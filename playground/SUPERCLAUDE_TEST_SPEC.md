# SUPER_CLAUDE End-to-End Test Specification

## Purpose

This document serves two goals:

1. **Define the real operational workflow** — how you use SUPER_CLAUDE on any project, day or night
2. **Define a test application** (KanBun Board) to validate that the orchestrator works end-to-end

---

## Part 1: The Real Workflow — Day Shift / Night Shift

### How SUPER_CLAUDE Is Meant to Be Used

The system has two modes of operation that mirror a human developer's natural rhythm:

```
DAY SHIFT (Human)                    NIGHT SHIFT (Agent)
─────────────────                    ───────────────────
1. Think about what to build         1. Orchestrator reads spec
2. Write a spec file                 2. Plans milestone (slices + tasks)
3. Set status: ready                 3. Executes TDD cycle per task
4. Run the orchestrator              4. Commits code, writes summaries
5. Go to sleep / do other work       5. Generates session report
                                     6. Stops when done or stuck

MORNING REVIEW (Human)
──────────────────────
1. Read session report (2 min)
2. Run the app, check UATs
3. Scan git diffs
4. If issues: fix system, not code
```

### What the Human Writes (The Only Input)

You write **one file**: a spec in `.superclaude/specs/`. That's it. Everything else is generated.

```
.superclaude/specs/feature-my-thing.md    ← YOU WRITE THIS
                                            (30-60 lines of requirements)

.superclaude/state/milestones/M001/       ← SYSTEM GENERATES ALL OF THIS
  ROADMAP.md                                (slices, boundary maps)
  slices/S01/PLAN.md                        (tasks, TDD sequences, must-haves)
  slices/S01/tasks/T01/PLAN.md              (per-task instructions)
  ...etc
```

### Spec File Format

This is the contract between human and system. Follow this format:

```markdown
---
title: Feature Name
status: ready          ← Set to "ready" when you want the agent to pick it up
priority: high         ← high | medium | low
milestone: M001        ← Which milestone this belongs to
---

## What
[1-2 paragraphs: what this feature does from the user's perspective]

## Why
[1 paragraph: why this feature matters]

## User Stories
- As a [user], I want to [action], so that [benefit]

## Requirements
- [Concrete, testable requirements — be specific]

## Tech Stack
- [What technologies to use — prevents the agent from guessing]

## Edge Cases
- [Things that could go wrong or are tricky]

## Out of Scope
- [Explicitly what this does NOT include — prevents scope creep]

## Open Questions
- [Anything ambiguous — triggers the DISCUSS phase where Claude asks you]
```

**Key insight:** You do NOT write task breakdowns, TDD sequences, must-haves, or boundary maps. The **architect agent** generates all of that during PLAN_MILESTONE and PLAN_SLICE phases. Your job is vision and requirements. The system's job is decomposition and execution.

### The Full Phase Sequence (What Happens Automatically)

When you run the orchestrator, here's what it does with your spec:

```
Phase 1: DISCUSS (optional)
  ↳ If your spec has "Open Questions", Claude asks you about them
  ↳ Produces: CONTEXT.md (decisions locked in)
  ↳ Skipped if: Open Questions section is empty or says "None"

Phase 2: RESEARCH (optional)
  ↳ Claude scouts the codebase + library docs
  ↳ Produces: RESEARCH.md (don't-hand-roll list, common pitfalls)
  ↳ Skipped under budget pressure or for simple projects

Phase 3: PLAN_MILESTONE
  ↳ Architect agent reads your spec + context + research
  ↳ Produces: ROADMAP.md with:
     - Ordered list of vertical slices (each passes the "user can ___" test)
     - Dependency graph (which slices depend on which)
     - Boundary maps (what each slice produces/consumes)
     - Risk assessment per slice

Phase 4: PLAN_SLICE (repeated per slice)
  ↳ Architect agent decomposes slice into context-window-sized tasks
  ↳ Produces: PLAN.md with:
     - Ordered task list
     - Per-task: goal, TDD sequence, must-haves, must-not-haves
     - Estimated complexity

Phase 5: EXECUTE_TASK (repeated per task, 4 sub-phases each)
  ↳ RED:      Implementer writes failing tests
  ↳ GREEN:    Implementer writes minimum code to pass
  ↳ REFACTOR: Implementer cleans up
  ↳ VERIFY:   Orchestrator runs static checks, tsc, linter, reviewer quality gate
  ↳ Git commit after each sub-phase: feat(S01/T01): [red] description

Phase 6: COMPLETE_SLICE (repeated per slice)
  ↳ Scribe writes SUMMARY.md + UAT.md
  ↳ Git commit: feat(S01): complete slice

Phase 7: REASSESS (repeated per slice)
  ↳ Architect checks: does the roadmap still make sense?
  ↳ May reorder, add, or remove remaining slices

Phase 8: COMPLETE_MILESTONE
  ↳ Scribe writes milestone SUMMARY.md
  ↳ Git squash merge to main + release tag
  ↳ Session report with metrics
```

### How to Start a New Project (Real Workflow)

```bash
# 1. Write your spec
vim .superclaude/specs/feature-my-app.md

# 2. Set the initial state (point to the milestone)
cat > .superclaude/state/STATE.md << 'EOF'
---
phase: PLAN_MILESTONE
currentMilestone: M001
currentSlice: null
currentTask: null
tddSubPhase: null
lastUpdated: 2026-03-18T00:00:00Z
---
EOF

# 3. Create the milestone directory
mkdir -p .superclaude/state/milestones/M001/slices

# 4. Run the orchestrator (then go to sleep)
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001 --budget=999.00

# 5. Morning: review results
cat .superclaude/history/sessions/session-*-auto.md
cat .superclaude/state/DASHBOARD.md
git log --oneline superc/M001
```

### How to Resume After Review

If the orchestrator stopped mid-milestone (stuck, error, or you paused it):

```bash
# Check where it left off
cat .superclaude/state/STATE.md

# Just restart — it picks up from the current state
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001 --budget=999.00
```

If a task has a CONTINUE.md file, the orchestrator loads it automatically on resume.

### How to Add Another Milestone

```bash
# Write a new spec
vim .superclaude/specs/feature-phase-two.md
# Set milestone: M002 in the frontmatter

# After M001 completes, STATE.md will be IDLE
# Update it to start M002
cat > .superclaude/state/STATE.md << 'EOF'
---
phase: PLAN_MILESTONE
currentMilestone: M002
currentSlice: null
currentTask: null
tddSubPhase: null
lastUpdated: 2026-03-18T00:00:00Z
---
EOF

mkdir -p .superclaude/state/milestones/M002/slices
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M002 --budget=999.00
```

---

## Part 2: Capability Assessment

### What's Implemented and Wired End-to-End

The orchestrator (`~12.6K LOC`, 22 modules, 348 passing tests) has these capabilities:

| Capability | Status |
|---|---|
| State machine (9 phases + 4 TDD sub-phases) | WIRED |
| Claude headless invocation (`claude -p`) | WIRED |
| Agent-enriched prompts (per-phase agent roles + SKILL.md) | WIRED |
| TDD enforcement (RED/GREEN/REFACTOR/VERIFY) | WIRED |
| Static verification (files, exports, stubs) | WIRED |
| Command verification (tsc, linter) | WIRED |
| Reviewer quality gate (6 personas) | WIRED |
| Doctor agent (stuck detection + diagnosis) | WIRED |
| Git operations (branch, commit, checkpoint, rollback, squash, tag) | WIRED |
| Budget pressure (4-tier graduated controls) | WIRED |
| Phase handlers (DISCUSS, RESEARCH, REASSESS) | WIRED |
| Session reports + dashboard + metrics | WIRED |
| Postmortem on failure | WIRED |
| Fractal summaries (task -> slice -> milestone) | WIRED |
| CONTINUE.md crash recovery | WIRED |
| Plan parser (PLAN.md -> TaskPlan) | WIRED |

### Known Risk Areas

1. **Plan format dependence** — The plan parser expects a specific markdown structure. If the architect agent outputs plans in a different format, verification may silently skip checks.
2. **First-run vault** — Only 3 starter docs exist. Quality improves as the vault accumulates patterns and learnings.
3. **State advancement** — If `determineNextActionEnhanced()` fails to discover the next task, stuck detection triggers after 2 dispatches.
4. **Never been run end-to-end** — Individual modules are tested (348 tests), but the full auto loop has never been exercised on a real project.

---

## Part 3: Test Application — KanBun Board

### Why This App

| Criteria | How KanBun Board Satisfies It |
|---|---|
| Multiple vertical slices | 3 slices: Auth, CRUD, UI |
| Cross-slice dependencies | S02 consumes auth from S01, S03 consumes APIs from both |
| UI component | React frontend in S03 |
| Basic auth | JWT-based signup/login in S01 |
| Few dependencies | 4 runtime deps (hono, jose, react, react-dom) + bun:sqlite built-in |
| Moderate complexity | 9 tasks total — enough to stress-test, not so many it takes forever |
| Demoable result | You can open a browser and use the board |

### Stack

| Component | Technology | Why |
|---|---|---|
| Runtime | Bun | Project standard, built-in SQLite |
| HTTP | Hono | Tiny (~14KB), Bun-native, good types |
| Database | bun:sqlite | Zero-dependency, built-in |
| Auth | jose | Standard JWT library |
| Frontend | React + ReactDOM | Standard UI library |
| Build | Bun bundler | Built-in, no config needed |
| CSS | Plain CSS | Zero dependencies |

### What the Human Writes (The Spec)

This is the ONLY file you create. The architect agent generates everything else.

```markdown
---
title: KanBun Board — Personal Kanban Task Manager
status: ready
priority: high
milestone: M001
---

## What
A personal Kanban board application where users can sign up, log in, create
boards with three columns (Todo, In Progress, Done), add cards to columns,
and move cards between columns. The entire application runs on Bun with a
React frontend served from the same process.

## Why
Test application to validate SUPER_CLAUDE autonomous coding. Exercises auth,
CRUD, and UI in three vertical slices with clear boundaries.

## User Stories
- As a new user, I want to sign up with email and password so I can start managing tasks
- As a returning user, I want to log in so I can access my boards
- As a user, I want to create a board so I can organize my tasks
- As a user, I want to add cards to columns so I can track work items
- As a user, I want to move cards between columns so I can track progress

## Requirements
- Users can sign up with email + password (hashed, never stored plain)
- Users can log in and receive a JWT token
- JWT tokens expire after 24 hours
- All board/card endpoints require authentication
- Each board has three fixed columns: Todo, In Progress, Done
- Cards have a title (required) and description (optional)
- Cards can be moved between any columns
- Cards have a position (order) within their column
- Users can only see/edit their own boards and cards
- The React UI renders in the browser at http://localhost:3000
- All code lives under playground/src/

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite (file-based, playground/data.db)
- Auth: jose (JWT), Bun's built-in crypto for password hashing
- Frontend: React + ReactDOM
- CSS: Plain CSS (no framework)
- Build: Bun bundler

## Edge Cases
- Concurrent card moves (last-write-wins is acceptable for MVP)
- Very long card titles (truncate at 200 chars)
- Empty boards (show encouraging empty state)
- Token expiration during active session (redirect to login)

## Out of Scope
- Real-time collaboration / websockets
- Card attachments or images
- Board sharing between users
- Drag-and-drop (use button-based movement)
- Card due dates or labels
- Email verification
- Password reset
- Mobile-specific UI

## Open Questions
- None — this spec is fully defined for autonomous execution
```

### What the System Generates (You Don't Write This)

For reference, here's what the architect agent SHOULD produce. This is included so you know what to expect, not because you need to create it:

**ROADMAP.md** (generated during PLAN_MILESTONE):
- S01: Authentication — "User can sign up and log in"
- S02: Board & Cards CRUD — "User can create boards and manage cards via API"
- S03: React UI — "User can interact with their board in a browser"
- Boundary maps: S01 produces auth helpers -> S02 consumes them -> S03 consumes API endpoints

**S01/PLAN.md** (generated during PLAN_SLICE):
- T01: Auth types + JWT helpers + password hashing (tests first, then implementation)
- T02: Signup + Login API endpoints
- T03: Auth middleware for protected routes

**S02/PLAN.md**:
- T01: Board + Card data models + schema
- T02: Board CRUD API endpoints
- T03: Card CRUD API endpoints with column movement

**S03/PLAN.md**:
- T01: App shell + auth forms
- T02: Board view with columns
- T03: Card creation + column movement

Each task plan includes TDD sequence, must-haves (truths, artifacts, key links), and must-not-haves. These are generated by the architect, not by you.

---

## Part 4: Step-by-Step Test Instructions

### Prerequisites

1. **Bun** installed (`bun --version` >= 1.0)
2. **Claude Code** installed and logged in with subscription
3. **Git** initialized in the project root (already done)

### Step 1: Prepare the Playground

```bash
cd /Users/narcisbrindusescu/newme/brn/playground

# Initialize package.json for the test app
cat > package.json << 'EOF'
{
  "name": "kanbun-board",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/server.ts",
    "build": "bun build src/client/index.tsx --outdir=public/dist",
    "test": "bun test"
  }
}
EOF

# Install dependencies
bun add hono jose react react-dom
bun add -d @types/react @types/react-dom typescript

# Create source directories
mkdir -p src/{lib,types,db,routes,middleware,client/components}
mkdir -p public

# Create tsconfig
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "types": ["bun-types", "@types/react", "@types/react-dom"],
    "noEmit": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
EOF

cd ..
```

### Step 2: Write the Spec

```bash
mkdir -p .superclaude/specs

# Write the spec file (copy the content from Part 3 above)
cat > .superclaude/specs/feature-kanbun-board.md << 'SPECEOF'
---
title: KanBun Board — Personal Kanban Task Manager
status: ready
priority: high
milestone: M001
---

## What
A personal Kanban board application where users can sign up, log in, create boards with three columns (Todo, In Progress, Done), add cards to columns, and move cards between columns. The entire application runs on Bun with a React frontend served from the same process.

## Why
Test application to validate SUPER_CLAUDE autonomous coding. Exercises auth, CRUD, and UI in three vertical slices with clear boundaries.

## User Stories
- As a new user, I want to sign up with email and password so I can start managing tasks
- As a returning user, I want to log in so I can access my boards
- As a user, I want to create a board so I can organize my tasks
- As a user, I want to add cards to columns so I can track work items
- As a user, I want to move cards between columns so I can track progress

## Requirements
- Users can sign up with email + password (hashed, never stored plain)
- Users can log in and receive a JWT token
- JWT tokens expire after 24 hours
- All board/card endpoints require authentication
- Each board has three fixed columns: Todo, In Progress, Done
- Cards have a title (required) and description (optional)
- Cards can be moved between any columns
- Cards have a position (order) within their column
- Users can only see/edit their own boards and cards
- The React UI renders in the browser at http://localhost:3000
- All code lives under playground/src/

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite (file-based, playground/data.db)
- Auth: jose (JWT), Bun's built-in crypto for password hashing
- Frontend: React + ReactDOM
- CSS: Plain CSS (no framework)
- Build: Bun bundler

## Edge Cases
- Concurrent card moves (last-write-wins is acceptable for MVP)
- Very long card titles (truncate at 200 chars)
- Empty boards (show encouraging empty state)
- Token expiration during active session (redirect to login)

## Out of Scope
- Real-time collaboration / websockets
- Card attachments or images
- Board sharing between users
- Drag-and-drop (use button-based movement)
- Card due dates or labels
- Email verification
- Password reset
- Mobile-specific UI

## Open Questions
- None — this spec is fully defined for autonomous execution
SPECEOF
```

### Step 3: Initialize State

```bash
# Point the state machine at M001
cat > .superclaude/state/STATE.md << 'EOF'
---
phase: PLAN_MILESTONE
currentMilestone: M001
currentSlice: null
currentTask: null
tddSubPhase: null
lastUpdated: 2026-03-18T00:00:00Z
---

## Current State
Starting M001 — KanBun Board MVP. Ready for milestone planning.
EOF

# Create milestone directory
mkdir -p .superclaude/state/milestones/M001/slices

# Write PROJECT.md
cat > .superclaude/state/PROJECT.md << 'EOF'
---
name: KanBun Board
description: Personal Kanban task board built with Bun
stack: TypeScript, Bun, Hono, React, bun:sqlite, jose
---

## Overview
A personal Kanban board application. All app code lives under playground/src/.
EOF
```

### Step 4: Launch (Then Go to Sleep)

```bash
# Full auto — let it run to completion
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001 --budget=999.00
```

Or if you want to watch it work one step at a time:

```bash
# Step mode — pauses after each iteration
bun run .superclaude/orchestrator/loop.ts --mode=step --milestone=M001
```

### Step 5: Monitor (Optional)

```bash
# In another terminal — watch state changes
watch -n 5 cat .superclaude/state/STATE.md

# Watch git commits appear
watch -n 10 'git log --oneline superc/M001 2>/dev/null || echo "No branch yet"'

# Watch files being created
watch -n 10 'find playground/src -name "*.ts" -o -name "*.tsx" 2>/dev/null | sort'
```

### Step 6: Morning Review

```bash
# 1. Read the session report
cat .superclaude/history/sessions/session-*-auto.md

# 2. Check the dashboard
cat .superclaude/state/DASHBOARD.md

# 3. Check git history
git log --oneline superc/M001

# 4. Run the tests
cd playground && bun test

# 5. Start the app
cd playground && bun run dev
# Open http://localhost:3000

# 6. Check state artifacts exist
ls .superclaude/state/milestones/M001/ROADMAP.md
ls .superclaude/state/milestones/M001/slices/S01/PLAN.md
ls .superclaude/state/milestones/M001/slices/S01/SUMMARY.md
```

---

## Part 5: Success Criteria

### PASSED

1. Orchestrator runs from PLAN_MILESTONE through COMPLETE_MILESTONE without manual intervention
2. All 3 slices completed with TDD-phase commits in git log
3. `bun test` passes in the playground directory
4. The app starts (`bun run dev`) and serves the React UI
5. A user can sign up, log in, create a board, add a card, and move the card
6. Session report shows `status: completed`
7. A release tag exists (`git tag --list | grep M001`)

### PARTIALLY PASSED

- 2 of 3 slices completed before stopping
- Tests pass for completed slices
- State machine advanced correctly through phases

### FAILED

- Orchestrator loops on first task indefinitely
- State never advances past PLAN_MILESTONE
- No test files created (TDD enforcement broken)
- No git commits created (git integration broken)

---

## Part 6: Troubleshooting

### "No more work to do. Stopping." immediately

STATE.md doesn't have the right milestone, or the spec file isn't found.
```bash
cat .superclaude/state/STATE.md      # Ensure currentMilestone: M001
ls .superclaude/specs/               # Ensure feature-kanbun-board.md exists
```

### Orchestrator loops on same task

State isn't advancing. Check console output for repeating iteration numbers.
```bash
# Emergency: manually edit state to advance
vim .superclaude/state/STATE.md
```

### Claude invocation fails

`claude -p` may not be in PATH.
```bash
claude -p "Say hello"                # Test it directly
claude --version                     # Verify installation
```

### Tests fail during GREEN phase

Expected: orchestrator retries 3x, then invokes Doctor agent. If still failing, flags as blocked.

Check the session report for Doctor's diagnosis, then resume:
```bash
bun run .superclaude/orchestrator/loop.ts --mode=step --milestone=M001
```

---

## Part 7: Quick Reference

### Commands

```bash
# Auto mode (full run)
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001 --budget=999.00

# Step mode (one iteration, then stop)
bun run .superclaude/orchestrator/loop.ts --mode=step --milestone=M001

# Check state
cat .superclaude/state/STATE.md

# Run tests
cd playground && bun test

# Start app
cd playground && bun run dev

# Session report
cat .superclaude/history/sessions/session-*-auto.md

# Git history
git log --oneline superc/M001

# Dashboard
cat .superclaude/state/DASHBOARD.md
```

### Expected Timeline

| Phase | Iterations | Time |
|---|---|---|
| PLAN_MILESTONE | 1 | 2-3 min |
| PLAN_SLICE (x3) | 3 | 6-9 min |
| EXECUTE_TASK (9 tasks x 4 TDD phases) | 36 | 60-120 min |
| COMPLETE_SLICE (x3) | 3 | 6-9 min |
| REASSESS (x3) | 3 | 3-6 min |
| COMPLETE_MILESTONE | 1 | 2-3 min |
| **Total** | **~47** | **~90-150 min** |

No cost concern — running on Claude subscription.

### Expected File Tree After Completion

```
playground/
  package.json
  tsconfig.json
  public/
    index.html
    dist/                          (bundled frontend)
  src/
    server.ts                      (Hono app + static serving)
    types/
      auth.ts                      (User, AuthPayload)
      board.ts                     (Board, Column, Card)
    lib/
      auth.ts + auth.test.ts       (JWT + password helpers)
    db/
      schema.ts + schema.test.ts   (SQLite schema + init)
    routes/
      auth.ts + auth.test.ts       (signup, login)
      boards.ts + boards.test.ts   (board CRUD)
      cards.ts + cards.test.ts     (card CRUD + movement)
    middleware/
      auth.ts + auth.test.ts       (JWT validation)
    client/
      index.tsx                    (React entry)
      App.tsx + App.test.tsx       (Root component)
      api.ts                       (API client with JWT)
      components/
        AuthForm.tsx               (Login/Signup)
        BoardView.tsx              (Board + columns)
        Column.tsx                 (Column + cards)
        CardItem.tsx               (Card display + move)
    style.css                      (Board layout)

.superclaude/state/milestones/M001/
  ROADMAP.md                       (generated by architect)
  SUMMARY.md                       (generated by scribe)
  slices/
    S01/PLAN.md, SUMMARY.md, UAT.md
      tasks/T01..T03/PLAN.md, SUMMARY.md
    S02/...
    S03/...
```
