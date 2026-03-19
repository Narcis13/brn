# M008 UAT

1. Run `pnpm exec vitest run tests/phase8.test.ts`.
2. Complete a slice and confirm Phase 8 writes `skill-health`, `pattern`, and `roadmap` artifacts without editing `vault/roadmap.md`, `vault/patterns/`, or `skills/`.
3. Generate a postmortem and confirm a linked process improvement report appears under `.supercodex/learning/process/`.
4. Run `pnpm cli learning show` and confirm the latest refs match the generated learning artifacts.
5. Run `pnpm cli doctor` and confirm missing or invalid learning refs are reported deterministically.
