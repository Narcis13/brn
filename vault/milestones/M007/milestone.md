# M007: Parallelism and Integration

## Objective

Add deterministic multi-worker task execution with isolated task worktrees, explicit resource ownership, and serialized integration back onto milestone branches.

## Why Now

The control plane can already plan, dispatch, verify, review, and recover one task at a time. Phase 7 scales that model by parallelizing only disjoint task work while keeping convergence and regression checks serialized.

## Exit Criteria

- Parallel dispatch only claims modern task units with satisfied dependencies, explicit likely-file ownership, and declared regression commands.
- Each active worker owns a task branch, isolated worktree, and durable worker state file.
- Verified tasks move into a serialized integration queue instead of being marked done immediately after review.
- Integration blocks milestone drift, missing completion artifacts, and regression failures deterministically.
- Doctor and metrics surfaces account for worker state, integration drift, and conflict outcomes.
