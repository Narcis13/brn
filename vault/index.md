# Vault Index

This vault is the long-lived human-readable memory surface for SUPER_CODEX.

Current navigation:

- Vision: [vision.md](/Users/narcisbrindusescu/newme/brn/vault/vision.md)
- Roadmap: [roadmap.md](/Users/narcisbrindusescu/newme/brn/vault/roadmap.md)
- Architecture: [architecture.md](/Users/narcisbrindusescu/newme/brn/vault/architecture.md)
- Constraints: [constraints.md](/Users/narcisbrindusescu/newme/brn/vault/constraints.md)
- Decisions: [decisions.md](/Users/narcisbrindusescu/newme/brn/vault/decisions.md)
- Assumptions: [assumptions.md](/Users/narcisbrindusescu/newme/brn/vault/assumptions.md)
- Feedback questions: [feedback/QUESTIONS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/QUESTIONS.md)
- Feedback blockers: [feedback/BLOCKERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/BLOCKERS.md)
- Feedback answers: [feedback/ANSWERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/ANSWERS.md)
- Active milestone: [milestones/M002/milestone.md](/Users/narcisbrindusescu/newme/brn/vault/milestones/M002/milestone.md)
- Active boundary map: [milestones/M002/boundary-map.md](/Users/narcisbrindusescu/newme/brn/vault/milestones/M002/boundary-map.md)
- Milestone docs: `M001`, `M002`, `M003`, `M004`, `M005`, `M006`, `M007`, `M008`

Status:

- Active milestone: M002
- Active slice: none
- Active task: none

Current queue head:

- `M002/S01`

Repository status notes:

- `M001` is complete and leaves behind the vault, state schemas, queue protocol, locks, and CLI scaffold.
- `M002` is the active implementation milestone for runtime adapters, normalized dispatch, and result handling.
- `M003` is decomposed in `vault/milestones/M003/` and implemented in source as next-action synthesis plus canonical run persistence.
- `M004` is decomposed in `vault/milestones/M004/` and implemented in source as the planning and slice engine.
- `M005` is tracked in `vault/milestones/M005/` and implemented in source as the TDD and verification pipeline.
- `M006` is now tracked in `vault/milestones/M006/` for recovery checkpoints, continuation packets, reconciliation, audits, and postmortems.
- `M007` is now tracked in `vault/milestones/M007/` and implemented in source as worker-aware parallel dispatch, isolated task worktrees, serialized integration, and integration conflict reporting.
- `M008` is now tracked in `vault/milestones/M008/` for skill telemetry, pattern candidates, roadmap reassessment reports, and process improvement artifacts.
- The default init scaffold remains anchored at `M002` so the earlier milestone regression suite can still start from a stable phase-by-phase baseline.
