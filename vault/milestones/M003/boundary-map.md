# M003 Boundary Map

## Produces

- Deterministic next-action selection and routing logic under `src/supercodex/synth/`
- Context assembly and packet framing modules that emit validated runtime-neutral dispatch packets
- Canonical run records in `.supercodex/runs/<run-id>/`
- CLI commands for next-action dry runs and single-step headless dispatch
- Retry, resume, and escalation decisions derived from state, policy, and run history

## Consumes

- `SUPER_CODEX.md`
- `.supercodex/state/current.json`, queue state, transitions, and locks
- `.supercodex/runtime/adapters.json`, `policies.json`, and `routing.json`
- Vault milestone, slice, task, decision, assumption, and feedback artifacts
- Phase 2 runtime handles and normalized results when resuming or retrying work

## Contracts

- Given the same disk state and policy files, next-action selection must be deterministic and explainable.
- Context assembly must record which references were included so prompt shape is inspectable from disk alone.
- Dispatch packets must remain runtime-neutral and validate before adapter execution.
- Canonical run records must capture packet, prompt, git snapshot, result evidence, blockers, assumptions, and continuation guidance.
- Retry and escalation policy must be bounded; repeated failure cannot silently loop forever.
- Phase 3 may move work into `dispatch`, `implement`, `recover`, `blocked`, or `awaiting_human`, but it must not claim verified completion that belongs to later verification phases.
