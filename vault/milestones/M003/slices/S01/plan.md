# S01 Plan

- Add synthesis types and schemas for next-action candidates, routing decisions, and dry-run output.
- Expand queue-head selection into a deterministic selector that also considers current phase, locks, active run state, and recent failure history.
- Route the selected unit to a role and runtime using `current.json`, `routing.json`, runtime capabilities, and bounded task-class heuristics.
- Expose a dry-run CLI path that returns structured JSON for operator inspection and tests.
