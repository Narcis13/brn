# M003: Next Action Synthesizer

## Objective

Automate the deterministic "read state -> decide next -> dispatch" loop by selecting eligible work, assembling bounded context, framing validated dispatch packets, applying retry and escalation policy, and persisting canonical run artifacts.

## Why Now

Phase 2 made Claude Code and Codex interchangeable at the adapter boundary, but dispatch is still operator-authored and manual. Without a real synthesizer, SUPER_CODEX still lacks the conductor behavior described in the spec and cannot progress headlessly from disk-backed state alone.

## Exit Criteria

- A dry-run command can explain the selected unit, runtime, role, and decision rationale from disk state alone.
- The synthesizer assembles context from current state, queue, vault artifacts, decisions, assumptions, and recent run history according to the active context profile.
- Validated dispatch packets are generated automatically for the selected unit instead of requiring operator-authored JSON.
- Canonical run artifacts are persisted under `.supercodex/runs/<run-id>/` and contain enough information to reconstruct the attempt without hidden chat state.
- Retry, resume, and escalation decisions are deterministic, bounded, and reflected in state plus feedback files when human input is required.
- A single CLI path can synthesize and dispatch the next action through either runtime using the existing Phase 2 adapter interface.
