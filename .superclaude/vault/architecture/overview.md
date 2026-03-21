---
title: System Architecture Overview
type: architecture
created: 2026-03-18
updated: 2026-03-18
updated_by: human
tags: [architecture, overview, core]
related: [[patterns/typescript]], [[testing/strategy]]
---

## Summary
SUPER_CLAUDE is a self-evolving AI coding system built on two layers: a deterministic orchestrator (TypeScript/Bun) and an LLM layer (Claude via Claude Code).

## Architecture Principles

### Two-Layer Design
1. **Deterministic layer** (`.superclaude/orchestrator/`) — Bun/TypeScript scripts that handle state management, git operations, context assembly, TDD enforcement, and verification. This layer never uses LLM judgment.
2. **LLM layer** (Claude via Claude Code) — Makes judgment calls: writing code, designing architecture, reviewing implementations, diagnosing failures.

### State on Disk
All state is markdown/JSON files in `.superclaude/state/`. Human-inspectable, git-trackable, no schema migrations. The agent reads/writes these files directly.

### Hierarchy: Milestone > Slice > Task
- **Milestone** — A shippable increment (days of work, 3-8 slices)
- **Slice** — A vertical feature slice (2-6 tasks, ends with a demo sentence)
- **Task** — One TDD cycle (RED → GREEN → REFACTOR → VERIFY)

### Sub-Agent System
8 specialized agents, each with focused skills and scoped vault access:
- `architect` — System design, interface contracts
- `implementer` — TDD code writing (the workhorse)
- `tester` — Test strategy and coverage
- `reviewer` — Code review from 6 personas
- `researcher` — Codebase scouting, library research
- `doctor` — Debugging and failure diagnosis
- `scribe` — Documentation, summaries, ADRs
- `evolver` — System self-improvement (meta-agent)

## Key Directories
```
.superclaude/
  orchestrator/   ← Deterministic brain (TypeScript)
  state/          ← Current state machine position
  vault/          ← Living knowledge base (this directory)
  skills/         ← SKILL.md files for sub-agents
  history/        ← Session reports, metrics, postmortems
  specs/          ← Human-written specifications
```

## Anti-Patterns
- Never mix deterministic logic with LLM judgment — keep layers separate
- Never store state in memory — always persist to disk
- Never skip TDD phases — the cycle is mechanically enforced
