# M002 Boundary Map

## Produces

- Validated runtime registry in `.supercodex/runtime/adapters.json`
- Shared dispatch and normalized result schemas in `.supercodex/schemas/`
- Runtime adapter modules under `src/supercodex/runtime/`
- CLI entrypoints for runtime listing, probing, dispatch, collect, resume, and cancel

## Consumes

- `SUPER_CODEX.md`
- Phase 1 state files and CLI scaffold
- Local `codex` and `claude` executables when present
- Operator-authored dispatch packet files

## Contracts

- Runtime registry entries are explicit, validated, and must exist for both `claude` and `codex`.
- Dispatch packets validate before execution and stay runtime-neutral at the file boundary.
- Normalized results validate before they are reported or collected.
- Runtime-specific raw output stays behind the adapter boundary and is referenced by `raw_ref`.
- Runtime temp artifacts may live under `.supercodex/temp/runtime/`, but canonical run persistence remains a later milestone concern.
