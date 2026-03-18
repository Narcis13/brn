# M002: Runtime Adapter Layer

## Objective

Add a real runtime adapter boundary with validated dispatch packets, capability probing, normalized results, and interchangeable Claude Code and Codex execution paths.

## Why Now

Phase 1 established trustworthy disk-backed state. The next bottleneck is execution portability: the orchestrator needs a stable way to probe, dispatch, collect, and resume work without hardcoding one runtime's CLI shape into the control plane.

## Exit Criteria

- `.supercodex/runtime/adapters.json` is a validated capability registry for both runtimes.
- Shared dispatch and result schemas exist and are enforced before and after execution.
- Codex and Claude adapters can each consume the same dispatch packet shape.
- Operators can probe runtimes and manually dispatch a packet from the CLI.
