# M007 UAT

1. Run `pnpm exec vitest run tests/phase7.test.ts`.
2. Confirm parallel dispatch only claims disjoint tasks and leaves overlapping work unclaimed.
3. Confirm verified tasks enter `ready_to_integrate` before they are marked `done`.
4. Confirm serialized integration reports milestone drift and regression failures as blocked outcomes.
5. Confirm successful integration removes the worker worktree and increments `integrated_tasks`.
