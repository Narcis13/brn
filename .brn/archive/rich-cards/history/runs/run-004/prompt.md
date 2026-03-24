# Run 004 Prompt: Search And Column Reorder Endpoints

## Goal
Complete the backend slice for `AC9` and `AC10` of the `rich-cards` feature by shipping:
- `GET /api/boards/:boardId/search`
- `PATCH /api/boards/:boardId/columns/reorder`

The working tree already contains a partial implementation for this slice. Finish it without discarding existing changes.

## Relevant Spec Excerpts
- `GET /api/boards/:boardId/search?q=<text>&label=<labelId>&due=<overdue|today|week|none>` searches cards by title/description text match, filters by label, filters by due date status, and returns a flat array of matching cards with their column info and labels.
- Search must be case-insensitive and escape SQL LIKE wildcards (`%`, `_`).
- `PATCH /api/boards/:boardId/columns/reorder` accepts `{column_ids: [...]}` in desired order, reassigns positions, and returns `400` if the array does not match the board's columns.

## Steering Constraints
- No active steering directives.

## Relevant Vault Knowledge
- `test-setup-pattern`: follow the existing `routes.test.ts` request helpers and `createTestDb()` setup instead of inventing a new harness.
- `position-based-ordering`: keep column positions gap-less and sequential starting from `0`.
- `auth-inline-verification`: keep board ownership checks inline in route handlers using `getVerifiedBoard()`.

## Files Likely To Change
- `trello/src/db.ts`
- `trello/src/routes.ts`
- `trello/src/routes-search-reorder.test.ts`

## Expected Verification
- Focused backend tests for the new search/reorder endpoints via `bun test`.
- Repository typecheck via `bunx tsc --noEmit`.
- Capture outputs in this run directory.
