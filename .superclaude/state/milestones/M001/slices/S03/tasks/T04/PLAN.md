---
task: T04
slice: S03
milestone: M001
status: pending
---

## Goal
Card Updates & Column Movement

**Goal:** Enable editing card content and moving cards between columns with position management.

#### TDD Sequence
- Test file(s): playground/src/routes/cards.test.ts (extend), playground/src/cards/card.service.test.ts (extend)
- Test cases:
  - PUT /api/cards/:id updates title and description
  - PUT /api/cards/:id validates board ownership
  - Moving card to different column updates position
  - Moving within column updates positions correctly
  - Service recalculates positions to prevent gaps
  - Cannot move card to invalid column
- Implementation file(s): playground/src/routes/cards.ts, playground/src/cards/card.service.ts

#### Must-Haves
**Truths:**
- Column moves reset position to end of target column
- Position updates maintain order integrity
- Only title, description, column, position updatable
**Artifacts:**
- playground/src/routes/cards.ts — PUT endpoint, min 40 lines added
- playground/src/cards/card.service.ts — updateCard, moveCard functions, min 60 lines added
**Key Links:** 
- card.service.ts uses transaction for position updates

#### Must-NOT-Haves
- NO complex drag-drop position calculations
- NO cross-board card movement
- NO card history tracking
