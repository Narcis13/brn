# Decisions

This log is append-only. Do not rewrite old entries; add new entries when decisions change.

### D-2026-03-18-001

- Status: accepted
- Scope: Phase 1 implementation
- Decision: Implement the first SUPER_CODEX control-plane milestone directly in this repository using Node 22, TypeScript, `pnpm`, and a CLI-first module layout under `src/supercodex/`.
- Rationale: Phase 1 is dominated by file orchestration, schema validation, and deterministic CLI flows. Node and TypeScript fit the future adapter-oriented roadmap without introducing a second toolchain.
- Alternatives considered: Python for fast scripting; Go for a single static binary; a separate implementation repository.
- Consequences: The repo becomes the real SUPER_CODEX implementation surface, and future milestones should extend the same package rather than treat this tree as spec-only.
