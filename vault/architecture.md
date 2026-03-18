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
- `supercodex/runtime`
  Runtime registry, dispatch packet validation, capability probing, adapter execution, and normalized result collection.
- `supercodex/cli`
  Operator entrypoint for init, doctor, reconcile, transition, queue, lock, and runtime commands.

## Invariants

- Disk artifacts are the source of truth for project state.
- State transitions are append-only in the journal and explainable from disk alone.
- Queue ordering is deterministic and based on file order plus dependency completion.
- Placeholder vault content is not considered production-ready project memory.
- Runtime dispatch packets must validate before execution and normalized results must validate before collection.

## Integration Seams

- Runtime adapters plug in through `.supercodex/runtime/` and only consume validated dispatch packets.
- Next-action synthesis will consume the same `current.json`, queue state, runtime registry, and milestone artifacts seeded here.
- Future git automation can extend the reconciled state without changing the Phase 1 public schema.

Suggested sections:

- system context
- module boundaries
- external dependencies
- invariants
- integration seams
