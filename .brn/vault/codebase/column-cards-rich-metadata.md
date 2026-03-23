---
title: Board column payloads now carry rich card summary metadata
type: codebase
confidence: verified
source: run-005
feature: rich-cards
created: 2026-03-23
---

## Insight
`GET /api/boards/:boardId/columns` is no longer just a transport for title/description card stubs. The board UI now depends on that payload carrying assigned labels plus computed checklist totals and completed counts for each card.

## Affected Code
- `trello/src/db.ts` `getAllColumns`
- `trello/src/routes.test.ts` board-columns metadata coverage
- `trello/src/ui/BoardView.tsx` board card face rendering

## Practical Rule
When the board surface needs scan-friendly metadata, enrich the column payload once on the server instead of fetching detail per card on the client.
