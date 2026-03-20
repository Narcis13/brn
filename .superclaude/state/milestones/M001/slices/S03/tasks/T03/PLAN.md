---
task: T03
slice: S03
milestone: M001
status: pending
---

## Goal
Card Retrieval & Listing

**Goal:** Implement endpoints to get cards by board and individual card details.

#### TDD Sequence
- Test file(s): src/routes/cards.test.ts (extend existing)
- Test cases:
  - GET /api/boards/:boardId/cards returns cards for owned board
  - GET /api/boards/:boardId/cards returns empty array for board with no cards
  - GET /api/boards/:boardId/cards returns 403 for unowned board
  - GET /api/cards/:id returns card details
  - GET /api/cards/:id validates board ownership
  - Cards returned in position order within columns
- Implementation file(s): src/routes/cards.ts, src/routes/boards.ts

#### Must-Haves
**Truths:** 
- Cards listed by board, not globally
- Cards sorted by position within each column
- Board ownership checked for all queries
**Artifacts:** 
- src/routes/cards.ts — GET endpoints, min 80 lines total
- src/routes/boards.ts — nested cards endpoint, min 20 lines added
**Key Links:** 
- routes/boards.ts imports from card.service.ts

#### Must-NOT-Haves
- NO global card search
- NO cross-board card queries
- NO pagination (not needed for MVP)
