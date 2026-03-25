# Run 004: Search And Column Reorder Endpoints

## Overview
This run completed the backend work for `AC9` and `AC10` of the `rich-cards` feature. The repository already contained uncommitted search/reorder changes, so the work started by treating the dirty tree as an interrupted attempt and resuming it carefully instead of replacing it.

## What Happened

### 1. Resumed partial backend work
- Loaded the active `rich-cards` spec, vault notes, history, and current state.
- Found that the tree already had search/reorder edits in `trello/src/db.ts` and `trello/src/routes.ts`, plus a new untracked test file.
- Detected BRN bookkeeping drift: `.brn/state.json` had a stale `run_count`, stale acceptance flags for `AC6`-`AC8`, and a future-dated `last_run`.

### 2. Finished the search implementation
- Kept the existing `searchCards()` helper and hardened it for production behavior.
- Added explicit SQLite `LIKE ... ESCAPE '\\'` handling so literal `%` and `_` characters do not act as wildcards.
- Switched due-date bucket comparisons to local `YYYY-MM-DD` formatting instead of `toISOString().split("T")[0]` to avoid timezone drift in positive UTC offsets.
- Kept the result payload flat with both column info and labels attached to each card.

### 3. Fixed the reorder endpoint behavior
- Confirmed the reorder helper validated full board membership and rejected duplicates or mismatched column sets.
- Found the route-level bug during focused verification: `PATCH /api/boards/:boardId/columns/reorder` was declared after `PATCH /api/boards/:boardId/columns/:id`, so valid reorder requests were being matched by the wrong handler.
- Moved the static `/reorder` route before the parameterized `/:id` route so Hono resolves the intended endpoint.

### 4. Replaced the broken ad hoc test file
- Rewrote `trello/src/routes-search-reorder.test.ts` to use the same request helpers and DB setup pattern as the rest of the test suite.
- Fixed incorrect assumptions in the original draft (`/api/auth/signup` instead of `/api/auth/register`, `column_id` instead of `columnId` in create-card requests).
- Added stable date fixtures, wildcard-escaping coverage, auth/ownership coverage, and reorder validation coverage.

### 5. Recovered from verification issues
- First focused test run exposed the route-shadowing problem and one overly broad search fixture.
- Full typecheck then surfaced a strict-mode issue in `reorderColumns()` caused by indexed access under `noUncheckedIndexedAccess`.
- Patched both issues and reran the full verification set until tests, typecheck, and build all passed cleanly.

## Result
- `AC9` is now implemented and verified.
- `AC10` is now implemented and verified.
- The backend slice for rich cards is now complete through search/filtering and column reordering.

## State Repairs
- Marked `AC6`, `AC7`, and `AC8` as met in `.brn/state.json` to align state with the already-committed `run-002` backend work.
- Replaced the stale future `last_run` value with the completed timestamp from this run.

## Next Focus
The next meaningful step is the frontend slice: card detail modal and board card enhancements (`AC11`, `AC12`, `AC15`, `AC16`, `AC17`), which can build directly on the now-complete backend endpoints.
