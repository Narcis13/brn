# M004 Boundary Map

## Produces

- Planning validators and queue synchronization under `src/supercodex/planning/`
- CLI commands for planning validation and queue synchronization
- Modern slice contracts with explicit `boundary-map.md` and `tasks/T##.md` artifacts
- Planning-aware next-action routing and state transitions

## Consumes

- `SUPER_CODEX.md`
- `vault/roadmap.md`, milestone docs, slice docs, and task files
- Phase 1 queue and current-state artifacts
- Phase 3 next-action synthesis and canonical run persistence

## Contracts

- Modern slices are not dispatchable implementation units until valid task files exist.
- Task files must be parseable from markdown sections without hidden chat state.
- Queue synchronization must be idempotent and preserve existing task completion state.
- Planning success is only accepted when the required vault artifacts validate from disk.
