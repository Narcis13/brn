# M003 UAT

1. Run `pnpm cli next-action show` and confirm the output includes the selected unit, runtime, role, and rationale with no handwritten packet input.
2. Run `pnpm cli next-action show --json` and confirm the synthesized dispatch packet validates and lists the context references it included.
3. Execute `pnpm cli next-action dispatch` against stub runtimes and confirm a canonical `.supercodex/runs/<run-id>/` directory is created alongside the runtime handle and normalized result.
4. Trigger an interrupted or failed attempt and confirm the next synthesis step chooses resume, retry, replan, or escalation according to persisted policy instead of silently starting from scratch.
5. Trigger a hard blocker and confirm the synthesizer writes a structured feedback entry and transitions state to `blocked` or `awaiting_human`.
