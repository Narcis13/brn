# M001 UAT

1. Run `pnpm cli init`.
2. Run `pnpm cli doctor` and confirm it reports `"ok": true`.
3. Run `pnpm cli queue next` and confirm `M001/S01` is selected.
4. Run `pnpm cli state show` and confirm the active milestone is `M001`.
5. Acquire and release a sample lock with `pnpm cli lock acquire` and `pnpm cli lock release`.
