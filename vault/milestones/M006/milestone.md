# M006: Recovery and Audit Layer

## Objective

Add deterministic checkpointing, continuation packets, recovery reconciliation, memory fidelity audits, and postmortem generation so interrupted or drifted work can be resumed from disk alone.

## Why Now

Phase 5 proves completion more rigorously, but the control plane still depends on a shallow continuation scaffold and ad hoc operator judgment after interruptions. Phase 6 makes recovery and audit first-class.

## Exit Criteria

- Every canonical run writes structured continuation artifacts and recovery checkpoints.
- Recovery assessment can explain whether a run should resume, retry, dispatch fresh, replan, or await human input.
- Operators can inspect and reconcile recovery state from the CLI without dispatching a runtime.
- Memory audits and postmortems are written to disk and reflected in state metrics.
- Doctor catches missing recovery artifacts, stale recovery state, and vault metadata drift.
