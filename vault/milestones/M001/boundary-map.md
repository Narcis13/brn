# M001 Boundary Map

## Produces

- Real project memory in `vault/`
- Validated control-plane files in `.supercodex/state/`
- Persisted schemas in `.supercodex/schemas/`
- CLI entrypoints for Phase 1 operations

## Consumes

- `SUPER_CODEX.md`
- Existing root router files
- Local git metadata for read-only reconcile

## Contracts

- `current.json` is the manifest-like current state and must validate before and after each CLI mutation.
- `queue.json` order is authoritative; the next eligible item is the first `ready` item whose dependencies are `done`.
- `transitions.jsonl` is append-only and must explain every explicit phase change.
- Lock files are one JSON file per resource under `.supercodex/state/locks/`.
