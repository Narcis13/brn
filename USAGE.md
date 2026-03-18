# SUPER_CLAUDE — Usage Guide

## Quick Start

```sh
# 1. Clone and install
git clone <repo-url> && cd brn
bun install

# 2. Run the orchestrator
bun run .superclaude/orchestrator/loop.ts

# 3. Run tests
bun test .superclaude/orchestrator/
```

## How It Works

SUPER_CLAUDE is a self-evolving AI coding system built on two layers:

- **Deterministic layer** (`.superclaude/orchestrator/`): TypeScript/Bun scripts handling state transitions, git operations, context assembly, cost tracking, and verification.
- **LLM layer** (Claude via Claude Code): Judgment work — architectural decisions, code writing, test design, debugging, reviews.

The orchestrator drives a state machine through phases. Each task gets a fresh context window with only what it needs (zero discovery calls).

## Project Hierarchy

```
Milestone (M001, M002, ...)
  └── Slice (S01, S02, ...)        — demo-able vertical slice
       └── Task (T01, T02, ...)    — atomic unit of work
```

State is stored as markdown files under `.superclaude/state/milestones/`.

## Phases

The state machine progresses through these phases per milestone:

| Phase | Purpose |
|---|---|
| **DISCUSS** | Surface gray areas, make decisions → produces `CONTEXT.md` |
| **RESEARCH** | Identify libraries, pitfalls, don't-hand-roll items → produces `RESEARCH.md` |
| **PLAN_MILESTONE** | Break milestone into slices and tasks → produces `ROADMAP.md` |
| **PLAN_SLICE** | Detail tasks within a slice |
| **EXECUTE_TASK** | TDD implementation (RED → GREEN → REFACTOR) |
| **REVIEW** | Multi-persona code review |
| **REASSESS** | Re-evaluate roadmap after each slice completes |
| **POSTMORTEM** | Extract learnings, update vault |

## TDD Enforcement

Every implementation task follows RED → GREEN → REFACTOR:

1. **RED**: Write failing tests that encode the requirement
2. **GREEN**: Write minimum code to pass
3. **REFACTOR**: Clean up without breaking tests

The orchestrator enforces this sequence — you cannot skip to GREEN without RED tests first.

## Budget Pressure

The system tracks token costs and applies graduated pressure:

| Tier | Threshold | Effect |
|---|---|---|
| **GREEN** | < 50% | All features enabled |
| **YELLOW** | 50–75% | Reduced review personas, smaller context |
| **ORANGE** | 75–90% | Research, refactor, discuss, reassess disabled |
| **RED** | > 90% | Only task execution, no reviews |

Budget pressure is computed per session and displayed in the dashboard.

## Dashboard

View project progress:

```sh
bun run .superclaude/orchestrator/dashboard.ts
```

Shows: current state, budget pressure, milestone/slice/task progress, system health score, and trend.

A markdown report is also written to `.superclaude/state/DASHBOARD.md` at session end.

## Key Files

| Path | Purpose |
|---|---|
| `SUPER_CLAUDE.md` | Full system specification |
| `AGENTS.md` | Sub-agent router and skill index |
| `.superclaude/orchestrator/loop.ts` | Main orchestration loop |
| `.superclaude/orchestrator/state.ts` | State machine and transitions |
| `.superclaude/orchestrator/types.ts` | All TypeScript types |
| `.superclaude/orchestrator/budget-pressure.ts` | Graduated cost controls |
| `.superclaude/orchestrator/milestone-manager.ts` | Multi-milestone lifecycle |
| `.superclaude/orchestrator/phase-handlers.ts` | DISCUSS/RESEARCH/REASSESS logic |
| `.superclaude/orchestrator/dashboard.ts` | Progress view rendering |
| `.superclaude/orchestrator/context.ts` | Context assembly for fresh windows |
| `.superclaude/orchestrator/tdd.ts` | TDD phase enforcement |
| `.superclaude/orchestrator/verify.ts` | Verification checks |
| `.superclaude/orchestrator/cost.ts` | Cost tracking |
| `.superclaude/orchestrator/git.ts` | Git operations |
| `.superclaude/state/STATE.md` | Current state machine position |
| `.superclaude/vault/` | Living knowledge base |

## Running Tests

```sh
# Full suite
bun test .superclaude/orchestrator/

# Individual module
bun test .superclaude/orchestrator/budget-pressure.test.ts
bun test .superclaude/orchestrator/milestone-manager.test.ts
bun test .superclaude/orchestrator/phase-handlers.test.ts
bun test .superclaude/orchestrator/dashboard.test.ts

# Type check
bunx tsc --noEmit
```

## Git Convention

- Branch per milestone: `superc/M001`
- Commits: `feat(S01/T01): [red|green|refactor] description`
- Squash merge to main on milestone completion
