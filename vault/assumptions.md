# Assumptions

Record interpretive decisions made without blocking the run.

### A-2026-03-18-001

- Timestamp: 2026-03-18T12:00:00Z
- Scope: Phase 1 git handling
- Assumption: Phase 1 only needs read-only git reconcile for dirty state, branch category, and head commit; branch/worktree mutation can wait for later milestones.
- Confidence: high
- Blast radius: low
- Requires later human review: no

### A-2026-03-18-002

- Timestamp: 2026-03-18T15:00:00Z
- Scope: Phase 2 runtime execution flags
- Assumption: The adapter layer should not hardcode dangerous approval-bypass flags. Runtime-specific default CLI args belong in `.supercodex/runtime/adapters.json` so operators can tune execution policy per environment.
- Confidence: medium
- Blast radius: medium
- Requires later human review: yes

### A-2026-03-18-003

- Timestamp: 2026-03-18T18:00:00Z
- Scope: Phase 3 completion semantics
- Assumption: Until Phase 5 lands, the synthesizer should persist evidence, blockers, and continuation guidance from normalized runtime results, but it should not auto-mark tasks or slices complete based only on Phase 3 execution output.
- Confidence: high
- Blast radius: medium
- Requires later human review: yes
