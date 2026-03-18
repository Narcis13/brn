# S03 Plan

- Define a canonical run record schema that captures the minimum fields from the SUPER_CODEX run-artifact contract.
- Mirror or reference Phase 2 runtime temp outputs from a conductor-owned run directory under `.supercodex/runs/`.
- Record pre-run and post-run git state plus `current.json` linkage such as `active_runtime`, `current_run_id`, and `recovery_ref`.
- Persist continuation guidance scaffolding so recovery has a stable on-disk handoff point before Phase 6 is fully implemented.
