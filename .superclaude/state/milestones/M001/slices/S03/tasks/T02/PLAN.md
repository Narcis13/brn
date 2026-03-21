---
task: T02
slice: S03
milestone: M001
status: pending
---

## Goal
Card Creation & Board Validation

**Goal:** Implement card creation API endpoint with board ownership validation.

#### TDD Sequence
- Test file(s): playground/src/cards/card.service.test.ts, playground/src/routes/cards.test.ts
- Test cases:
  - Service validates board exists before card creation
  - Service validates user owns board
  - Service sets initial position for new cards
  - POST /api/cards creates card with valid input
  - POST /api/cards returns 404 for non-existent board
  - POST /api/cards returns 403 for board not owned by user
- Implementation file(s): playground/src/cards/card.service.ts, playground/src/routes/cards.ts, playground/src/index.ts

#### Must-Haves
**Truths:**
- User must own the board to create cards
- New cards get position at end of column
- Card title is required, description optional
**Artifacts:**
- playground/src/cards/card.service.ts — validation logic, min 80 lines, exports validateBoardOwnership, createCard
- playground/src/routes/cards.ts — POST endpoint, min 40 lines, exports cards router
- playground/src/index.ts — updated with cards route, min 1 line added
**Key Links:** 
- card.service.ts imports from board.repo.ts
- routes/cards.ts imports authMiddleware from auth/middleware.ts
- app.ts imports cards from routes/cards.ts

#### Must-NOT-Haves
- NO bulk card creation
- NO card templates or presets
- NO due dates or priorities
