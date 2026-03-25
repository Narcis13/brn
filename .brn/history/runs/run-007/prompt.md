## Goal
Finish the Takt CLI feature by standardizing CLI auth/DB/formatting behavior and implementing the remaining command surface for cards, labels, comments, and search.

## Relevant Spec Excerpts
- `takt <resource> <action> --flags` must cover every existing functionality without the server running.
- All commands except `auth register`, `auth login`, `serve`, and help/version require a valid session.
- Output formatting must support aligned tables, truncated IDs with `...`, `--full-ids`, `--json`, `--quiet`, date formatting, and ANSI colors.
- DB path resolution must use the local project DB when invoked from the project and the saved session DB path when used globally.

## Steering Constraints
- No active steering directives.

## Relevant Vault Knowledge
- Escape SQLite LIKE input with `ESCAPE '\\'` for search behavior.
- Reuse established test setup patterns and `createTestDb` instead of ad hoc DB fixtures where possible.

## Files Likely To Change
- `src/cli.ts`
- `src/cli-board.ts`
- `src/cli-column.ts`
- `src/cli-card.ts`
- `src/cli-auth.ts`
- new CLI helper modules/tests for labels, comments, search, and shared utilities
- `.brn/state.json`
- `.brn/history/index.json`

## Expected Verification
- `bun test`
- `bunx tsc --noEmit`
