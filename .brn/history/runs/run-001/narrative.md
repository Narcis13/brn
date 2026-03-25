# Run 001: Foundation — Database Schema + Board Members + Authorization Refactor

## Context
This is the first run of the social-interactions feature. No prior implementation exists. The codebase has a working Trello clone with auth, boards, columns, cards, labels, and activity tracking — but all board access is gated by `board.user_id === userId` (single-owner model). The spec requires multi-user collaboration, which means introducing board membership as the foundation for everything else.

## Approach
Vertical foundation slice: create ALL new tables upfront (board_members, comments, reactions, card_watchers), add user_id to activity, implement board_members API endpoints, and refactor authorization — all in one step. This is justified because every subsequent feature (comments, reactions, watchers, UI) depends on board membership existing and working.

## What Was Built

### Files Modified
- `trello/src/db.ts` — Added 4 new tables (board_members, comments, reactions, card_watchers) to migration; added user_id column to activity table; added BoardMemberRow and CommentRow interfaces; added ActivityRow.user_id field; added board_members helper functions (isBoardMember, isBoardOwner, getBoardMembers, addBoardMember, removeBoardMember); modified createBoard() to auto-insert creator as owner; modified createCard() and updateCardWithActivity() to accept and pass userId; modified createActivity() to accept userId parameter; modified getUserBoards() to query via board_members join; added backfill migration for existing boards.
- `trello/src/routes.ts` — Added imports for new db functions; refactored getVerifiedBoard() to check board_members instead of board.user_id; updated DELETE /api/boards/:id to check ownership properly (404 for non-members, 403 for non-owners); added GET/POST/DELETE board members endpoints; updated all activity creation calls to pass userId from context.
- `trello/src/routes.test.ts` — Added 18 new tests covering: board members listing, inviting, removing, authorization for members vs non-members, owner-only operations, board list inclusion for invited members, and activity user_id tracking.
- `trello/src/db-migration.test.ts` — Fixed pre-existing updated_at test failure; added assertions for new tables (board_members, comments, reactions, card_watchers, activity.user_id).

## Key Decisions
- **All tables created upfront**: Rather than creating tables piecemeal per feature, all 4 new tables were created in the first migration. This means schema is stable from the start and subsequent runs only need to implement business logic.
- **Backfill migration for existing boards**: `INSERT OR IGNORE INTO board_members SELECT id, user_id, 'owner' FROM boards` ensures existing data remains accessible after the authorization change.
- **404 for non-members, 403 for non-owners**: Non-members see the board as non-existent (404, no information leakage). Members who lack owner privileges get 403. This mirrors how GitHub handles private repos.
- **getUserBoards via JOIN**: Changed from `WHERE user_id = ?` to a JOIN on board_members, so invited members see shared boards in their board list.
- **Nullable user_id on activity**: Existing activity entries have no user. The column is nullable so legacy "System" entries coexist with new user-attributed entries.

## Challenges & Solutions
- **Pre-existing test failure**: `db-migration.test.ts` was inserting cards directly via SQL without setting `updated_at`, causing a falsy assertion. Fixed by adding `updated_at` to the direct insert.
- **Authorization behavior change**: DELETE /api/boards/:id previously returned 404 for non-owners. The new model returns 403 for members who aren't owners, and 404 for non-members. Required careful two-step check: first check membership, then check ownership.

## Verification Results
- Tests: 241 passed, 0 failed
- Types: clean (0 errors)
- Build: N/A

## Acceptance Criteria Progress
- AC1 MET: board_members table + endpoints working
- AC5 MET: activity.user_id column added, all callers updated
- AC6 MET: authorization refactored to use board_members
- Overall: 3/14 met

## Vault Entries Added
- `patterns/board-membership-authorization.md` (pattern): Multi-level authorization pattern
- `decisions/all-tables-upfront-migration.md` (decision): Why all social tables were created in run 001

## What's Next
Run 002 should implement comments API endpoints (AC2) — POST/PATCH/DELETE comments with proper authorization, activity creation for "commented" action, and auto-watch on comment.
