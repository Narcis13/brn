# Run 003: Reactions API + Watchers API

## Context
Runs 001-002 established the database schema (all tables including reactions and card_watchers), board members with authorization, and comments CRUD. The reactions and card_watchers tables exist but have no API endpoints yet. This run implements both toggle APIs as they share the same pattern (single POST endpoint that adds/removes).

## Approach
Paired two small, structurally similar APIs into one step. Both are toggle endpoints: one POST that checks if the resource exists, adds if not, removes if so. This keeps each step coherent and demoable — "users can now react to comments and watch cards."

## What Was Built

### Files Modified
- `trello/src/db.ts` — Added 7 new functions and 2 interfaces:
  - `isAllowedEmoji()` — validates against the 8-emoji allowlist Set
  - `toggleReaction()` — checks for existing reaction, adds or removes, returns action + reaction object
  - `targetExists()` — verifies comment or activity row exists
  - `getTargetBoardId()` — gets board_id from comment or activity for cross-board validation
  - `toggleCardWatcher()` — checks existing watcher, adds or removes, returns boolean watching state
  - `isWatching()` — check if user is watching a card
  - `getWatcherCount()` — count watchers for a card
  - `ReactionRow` interface for type safety

- `trello/src/routes.ts` — Added 2 new route handlers:
  - `POST /api/boards/:boardId/reactions` — validates target_type, target_id, emoji against allowlist, verifies target exists and belongs to board, calls toggleReaction
  - `POST /api/boards/:boardId/cards/:cardId/watch` — verifies card belongs to board, calls toggleCardWatcher, returns watching boolean

- `trello/src/routes.test.ts` — Added 14 new tests across 2 describe blocks:
  - Reactions (9 tests): add to comment, toggle off, add to activity, reject disallowed emoji, reject missing target_type, 404 for non-existent target, reject non-member, different users same emoji, same user different emoji
  - Watchers (5 tests): toggle on, toggle off, auto-watch interaction with manual toggle, reject non-member, 404 for non-existent card

## Key Decisions
- **Reactions scoped to board URL**: The endpoint is `POST /api/boards/:boardId/reactions` (not nested under cards) because reactions target both comments and activity entries. The route validates that the target's board_id matches the URL's boardId.
- **Target validation via dynamic table lookup**: `targetExists` and `getTargetBoardId` use the target_type to select the correct table. This avoids separate endpoints for comment vs activity reactions.
- **Toggle pattern for both**: Both reactions and watchers use a check-then-add-or-remove pattern rather than separate add/remove endpoints, matching the spec's toggle semantics.

## Challenges & Solutions
No issues — the tables were already created in run-001, so this was pure business logic. The patterns from comments (membership auth, board verification) applied directly.

## Verification Results
- Tests: 270 passed, 0 failed (14 new)
- Types: clean
- Build: N/A

## Acceptance Criteria Progress
- AC3 met this run: reactions toggle with emoji allowlist
- AC4 met this run: watchers toggle with is_watching support
- Overall: 6/14 met

## Vault Entries Added
- `patterns/toggle-endpoint-pattern.md` (pattern): Toggle add/remove with single POST
- `decisions/reactions-scoped-to-board.md` (decision): Why reactions live at board level

## What's Next
AC7: Enhanced card detail endpoint — unified timeline (comments + activity sorted newest first with reactions), is_watching, watcher_count, board_members for @mention autocomplete.
