# S02 Boundary Map

- Recovery assessment reads canonical run records, runtime handles, queue state, verification state, and git state.
- `recover show` is read-like and returns the current assessment.
- `recover reconcile` persists the assessment and updates deterministic phase/state without dispatching a runtime.
