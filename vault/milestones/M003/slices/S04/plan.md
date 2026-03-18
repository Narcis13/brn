# S04 Plan

- Add bounded retry policy keyed by unit type, runtime support, and recent normalized statuses.
- Resume interrupted work only when the runtime supports it and the run record still matches current disk state.
- Append structured entries to `vault/feedback/QUESTIONS.md` or `vault/feedback/BLOCKERS.md` when ambiguity or failure exceeds safe defaults.
- Transition state into `recover`, `blocked`, or `awaiting_human` when policy requires it.
