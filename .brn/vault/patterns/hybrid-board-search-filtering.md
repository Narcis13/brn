---
title: Hybrid board search pairs instant local filtering with debounced server reconciliation
type: pattern
confidence: verified
source: run-006
feature: rich-cards
created: 2026-03-23
---

## Insight
When the board payload already contains title, description, and label metadata, the UI should filter immediately against the loaded columns and only use `/api/boards/:boardId/search` as a debounced reconciliation step.

## Affected Code
- `trello/src/ui/BoardView.tsx`
- `trello/src/ui/board-utils.ts`
- `trello/src/ui/api.ts`

## Practical Rule
Clear remote search ids on every query change so stale server matches never shadow the immediate in-memory filter, then reapply the debounced server result once it returns.
