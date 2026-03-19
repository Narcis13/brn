# M007 Boundary Map

- Scheduler surface:
  `.supercodex/state/queue.json`, `.supercodex/state/parallel.json`, `.supercodex/state/workers/*.json`
- Git isolation:
  milestone branches, task branches, `.supercodex-worktrees/`, resource locks
- Runtime surface:
  dispatch packets with `git_context`, `owned_resources`, execution cwd overrides
- Verification surface:
  worker-local completion artifacts with control-root canonical run records
- Convergence surface:
  `.supercodex/state/integration.json`, integration reports, serialized regression runs
