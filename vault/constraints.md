# Constraints

## Product Constraints

- State, queueing, routing, and safety gates must remain deterministic-layer concerns.
- Durable memory must stay local, Git-friendly, and inspectable without a proprietary service.

## Technical Constraints

- Phase 1 uses Node 22 and TypeScript with `pnpm`.
- Public interfaces for Phase 1 are CLI commands plus persisted JSON/JSONL files.
- `CurrentState` keeps the existing high-level schema shape from the spec appendix.

## Security Constraints

- No production access or secret-bearing automation is in scope for Phase 1.
- Irreversible actions remain outside autonomous execution.

## Operational Constraints

- Init must be idempotent and must not overwrite non-placeholder human-authored vault content.
- Doctor must fail fast on schema drift, placeholder content, and state/journal inconsistency.
