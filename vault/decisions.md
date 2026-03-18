# Decisions

This log is append-only. Do not rewrite old entries; add new entries when decisions change.

### D-2026-03-18-001

- Status: accepted
- Scope: Phase 1 implementation
- Decision: Implement the first SUPER_CODEX control-plane milestone directly in this repository using Node 22, TypeScript, `pnpm`, and a CLI-first module layout under `src/supercodex/`.
- Rationale: Phase 1 is dominated by file orchestration, schema validation, and deterministic CLI flows. Node and TypeScript fit the future adapter-oriented roadmap without introducing a second toolchain.
- Alternatives considered: Python for fast scripting; Go for a single static binary; a separate implementation repository.
- Consequences: The repo becomes the real SUPER_CODEX implementation surface, and future milestones should extend the same package rather than treat this tree as spec-only.

### D-2026-03-18-002

- Status: accepted
- Scope: Phase 2 runtime adapter layer
- Decision: Implement Phase 2 as a typed adapter boundary under `src/supercodex/runtime/` with a validated runtime registry, shared dispatch packet schema, normalized result schema, and thin CLI wrappers around the local `codex` and `claude` executables.
- Rationale: The spec requires interchangeable runtimes at the orchestrator boundary. A small adapter layer keeps runtime-specific argv handling and result parsing isolated while preserving the deterministic control plane built in Phase 1.
- Alternatives considered: Directly embedding runtime logic in `src/cli.ts`; delaying dispatch support until Phase 3; forcing one runtime to be primary and emulating the other.
- Consequences: Runtime-specific execution remains replaceable, probe results can be persisted to disk, and Phase 3 can assemble packets without knowing runtime CLI details.

### D-2026-03-18-003

- Status: accepted
- Scope: Phase 3 next-action synthesizer
- Decision: Implement Phase 3 as a deterministic orchestration layer under `src/supercodex/synth/` that performs next-action selection, context assembly, runtime-neutral packet framing, canonical run persistence under `.supercodex/runs/`, and dry-run or dispatch orchestration through the existing runtime adapter boundary.
- Rationale: Phase 2 already established a shared packet and result contract. Keeping Phase 3 above that seam preserves runtime interchangeability, makes selection and packet generation unit-testable without live runtimes, and gives later phases a stable place to add planning, verification, and recovery logic.
- Alternatives considered: Embedding synthesis directly in `src/cli.ts`; letting runtime adapters own prompt or packet construction; treating `.supercodex/temp/runtime/` as the canonical run store.
- Consequences: Phase 3 will need its own schemas, CLI surface, and run-artifact model, while Phase 2 runtime temp directories remain adapter-owned scratch space rather than the durable audit record.
