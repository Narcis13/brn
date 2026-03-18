# S02 Research

- Planning units should prefer the reasoning-first runtime policy.
- Returning to `plan` after planning success requires an explicit `dispatch -> plan` transition.
- Queue sync must happen before the final planning-state transition so the queue head reflects the new task surface.
