---
title: Reactions endpoint scoped to board URL, not nested under cards
type: decision
confidence: verified
source: run-003
feature: social-interactions
created: 2026-03-25
---

## Choice
Placed the reactions toggle at `POST /api/boards/:boardId/reactions` with `target_type` and `target_id` in the body, rather than nesting under cards or creating separate endpoints per target type.

## Alternatives Considered
- `POST /api/boards/:boardId/cards/:cardId/comments/:commentId/reactions` — deeply nested, only works for comments
- `POST /api/boards/:boardId/cards/:cardId/activity/:activityId/reactions` — separate endpoint for activity reactions
- `POST /api/reactions` — no board scoping for authorization

## Rationale
1. Reactions can target both comments and activity entries — a single endpoint with target_type avoids duplication
2. Board-level scoping provides the membership check needed for authorization
3. The route handler validates that the target's board_id matches the URL boardId, preventing cross-board reactions
4. Matches the spec's design: `POST /api/boards/:boardId/reactions`
