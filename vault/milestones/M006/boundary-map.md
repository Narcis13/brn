# M006 Boundary Map

- Recovery artifacts live in `.supercodex/runs/<run-id>/` beside canonical run records and must remain runtime-neutral.
- Recovery decisions consume canonical run records, runtime handles, queue state, verification state, and git state; they must not rely on hidden chat memory.
- Memory audits read vault summaries, task contracts, verification artifacts, queue truth, and run artifacts, but they do not mutate roadmap, decision, or assumption docs automatically.
- Postmortems are artifact-only in Phase 6 and feed later learning phases without rewriting durable memory directly.
