# Architecture

## System Context

SUPER_CODEX is split into a human-readable memory plane in `vault/` and a machine-owned control plane in `.supercodex/`.

## Module Boundaries

- `supercodex/vault`
  Scaffolding, placeholder replacement, and durable project-memory validation.
- `supercodex/state`
  `current.json`, `queue.json`, lock files, transition journal, and transition rules.
- `supercodex/git`
  Read-only reconcile of dirty state, current branch category, and head commit for Phase 1.
- `supercodex/cli`
  Operator entrypoint for init, doctor, reconcile, transition, queue, and lock commands.

## Invariants

- Disk artifacts are the source of truth for project state.
- State transitions are append-only in the journal and explainable from disk alone.
- Queue ordering is deterministic and based on file order plus dependency completion.
- Placeholder vault content is not considered production-ready project memory.

## Integration Seams

- Runtime adapters plug in after Phase 1 through `.supercodex/runtime/`.
- Next-action synthesis will consume the same `current.json`, queue state, and milestone artifacts seeded here.
- Future git automation can extend the reconciled state without changing the Phase 1 public schema.

Suggested sections:

- system context
- module boundaries
- external dependencies
- invariants
- integration seams
