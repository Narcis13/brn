# Playground

Use this directory as the operator-facing toy-project exercise surface.

Suggested flow:

1. Create a fresh git repo under `playground/` or another temp directory.
2. Run `pnpm cli init`.
3. Replace `vault/vision.md` with the toy-project intent.
4. Run `pnpm cli plan generate-roadmap --milestones "M101:Toy Greeting Flow" --active-milestone M101`.
5. Run `pnpm cli plan generate-milestone --milestone M101 --title "Toy Greeting Flow" --objective "<...>" --why-now "<...>" --exit-criteria "<a|b>" --activate --replace-queue`.
6. Run `pnpm cli plan generate-slice --unit M101/S01 --title "Ship the toy hello path" --demo "<...>" --acceptance "<a|b>" --likely-files "src/toy.ts|tests/toy.test.ts"`.
7. Run `pnpm cli plan generate-tasks --unit M101/S01 --count 2 --likely-files "src/toy.ts|tests/toy.test.ts" --verification "pnpm test|pnpm cli plan validate --unit M101/S01"`.
8. Run `pnpm cli plan sync`, `pnpm cli next-action show --json`, and `pnpm cli next-action dispatch`.
9. Inspect `.supercodex/runs/<run-id>/`, `vault/assumptions.md`, and `vault/feedback/`.

The automated regression for this flow lives in `tests/playground.test.ts`.
