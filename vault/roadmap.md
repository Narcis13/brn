# Roadmap

## Intent

Build SUPER_CODEX in milestone order so each milestone leaves behind a usable control-plane capability.

## Current Status

- Active milestone: `M002` / Runtime Adapter Layer

## Milestones

- `M001` / Vault and State Engine
  Deliver real vault memory, state schemas, transition journal, queue files, lock files, and CLI access.
- `M002` / Runtime Adapter Layer
  Add normalized Claude Code and Codex adapters plus capability probing and result normalization.
- `M003` / Next Action Synthesizer
  Assemble context, choose eligible work, persist dispatch packets, and prepare headless execution.
- `M004` / Planning and Slice Engine
  Turn roadmap intent into milestone, slice, and task artifacts with explicit contracts and dependencies.
- `M005` / TDD and Verification Pipeline
  Enforce task-level TDD modes, verification ladders, and mandatory reviewer passes.
- `M006` / Recovery and Audit Layer
  Add continuation packets, resume logic, drift detection, and memory fidelity audits.
- `M007` / Parallelism and Integration
  Add safe lock-aware parallel scheduling and deterministic convergence.
- `M008` / Compound Learning
  Capture patterns, skill health, postmortems, and roadmap reassessment signals.
