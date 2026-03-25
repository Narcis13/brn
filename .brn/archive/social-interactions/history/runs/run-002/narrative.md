# Run 002: Comments API — CRUD with authorization, activity, and auto-watch

## Context
Run-001 established the database schema (all 4 social interaction tables), board members API, and authorization refactor. The comments table already exists; this run implements the API endpoints on top of it.

## Approach
Vertical slice: implement all three comment endpoints (POST, PATCH, DELETE) plus the db-layer helper functions in a single step. Side effects (activity logging, auto-watch) are bundled in the `createComment` db function for transactional consistency.

## What Was Built

### Files Modified
- `trello/src/db.ts` — Added 5 new functions: `createComment`, `getCommentById`, `updateComment`, `deleteComment`, `addCardWatcher`. Added `CommentWithUser` interface. `createComment` bundles side effects: creates "commented" activity entry and auto-watches card via INSERT OR IGNORE.
- `trello/src/routes.ts` — Added 3 comment endpoints under `/api/boards/:boardId/cards/:cardId/comments`. POST validates content (1-5000 chars), creates comment, returns with empty reactions array. PATCH is author-only edit. DELETE allows author or board owner.
- `trello/src/routes.test.ts` — Added 15 new tests across 3 describe blocks covering: create success, activity creation, auto-watch idempotency, empty content rejection, length validation, non-member rejection, member access, non-existent card, author edit, non-author edit rejection, empty edit rejection, author delete, owner delete, non-author/non-owner delete rejection, non-existent comment.

## Key Decisions
- **Side effects in db layer**: Activity logging and auto-watch happen inside `createComment()` rather than in the route handler. This ensures consistency if `createComment` is ever called from other code paths.
- **Three-tier auth**: create=member, edit=author-only, delete=author+owner. Matches the spec's moderation model.
- **INSERT OR IGNORE for watchers**: Makes `addCardWatcher` idempotent — safe to call multiple times for the same user/card.
- **Content validation in route**: Length >5000 checked before hitting the db CHECK constraint, giving a cleaner error message.

## Challenges & Solutions
- **SQLite datetime granularity**: Initial test asserted `updated_at !== created_at` after immediate edit, but both resolve to the same second. Fixed by asserting on content change and field presence instead.

## Verification Results
- Tests: 256 passed, 0 failed
- Types: clean
- Build: N/A

## Acceptance Criteria Progress
- AC2 met this run: comments table + POST/PATCH/DELETE endpoints with auth + activity + auto-watch
- Overall: 4/14 met

## Vault Entries Added
- `patterns/comment-crud-with-side-effects.md` (pattern): Bundle side effects in db-layer create function
- `anti-patterns/sqlite-datetime-second-granularity.md` (anti-pattern): datetime('now') second-level granularity breaks rapid create/update assertions
- `decisions/comment-auth-three-tier.md` (decision): Three-tier authorization for comments

## What's Next
AC3: Reactions API — POST toggle endpoint with 8-emoji allowlist and unique constraint handling.
