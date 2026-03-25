# Run 004: Enhanced card detail with unified timeline + board activity feed

## Context
After runs 001-003 built the foundation (schema, board members, authorization, comments, reactions, watchers), the next logical step was to enhance the card detail endpoint (AC7) and add the board-wide activity feed (AC8). These are the last two API-only ACs before UI work begins.

## Approach
Tackled both AC7 and AC8 together since they share core concepts: unified timeline from comments + activity, reactions attached to items, and user-centric data (watching, members). The strategy was:
1. Add reusable db functions (`getCardComments`, `getReactionsGrouped`)
2. Enhance `getCardDetail` with full timeline, watching state, and board members
3. Add new `getBoardFeed` function and route for board-wide feed
4. Update existing tests for new response shape, add comprehensive new tests

## What Was Built

### Files Modified
- `trello/src/db.ts` — Added `getCardComments`, `getReactionsGrouped` helpers; rewrote `getCardDetail` with unified timeline, is_watching, watcher_count, board_members; added `getBoardFeed` with `before` pagination; exported new interfaces (`TimelineItem`, `TimelineComment`, `TimelineActivity`, `ReactionGroup`, `BoardFeedItem`, `BoardFeedResult`)
- `trello/src/routes.ts` — Updated card detail handler to pass `userId`; added `GET /api/boards/:boardId/activity` endpoint with limit/before params
- `trello/src/routes-card-detail.test.ts` — Updated `CardDetailResponse` interface; fixed 1 existing test for new shape; added 13 new tests
- `trello/src/routes.test.ts` — Fixed 1 existing test referencing old `activity` field

## Key Decisions
- **In-memory merge over SQL UNION**: Fetch comments and activity separately, map to discriminated union, merge and sort in JS. Simpler, more maintainable, avoids NULL-column padding.
- **Batch reaction loading**: Single query per target_type for all IDs, group in Map — avoids N+1.
- **`getCardDetail` signature change**: Added `userId` parameter to compute `is_watching`. Breaking change but necessary.
- **Board feed `before` pagination**: Uses timestamp-based cursor instead of offset — more reliable for feeds with concurrent writes.

## Challenges & Solutions
- Two existing tests broke because they referenced `detail.activity` which became `detail.timeline` — straightforward fix to use the new field.
- No other issues — the foundation from runs 001-003 was solid.

## Verification Results
- Tests: 283 passed, 0 failed
- Types: clean
- Build: N/A

## Acceptance Criteria Progress
- AC7 met: card detail returns unified timeline, is_watching, watcher_count, board_members
- AC8 met: board activity feed with pagination
- Overall: 8/14 met

## Vault Entries Added
- `patterns/unified-timeline-pattern.md` (pattern): discriminated union merge-sort for heterogeneous timeline
- `patterns/grouped-reactions-pattern.md` (pattern): batch-fetch and Map-group reactions
- `decisions/timeline-replaces-activity-array.md` (decision): why timeline replaces flat activity array

## What's Next
AC9-AC14 are all UI work. Next logical step: AC9 (board header member avatars + invite popover) and AC13 (watch button in card modal) — these are the simpler UI pieces that connect to the APIs built in runs 001-004.
