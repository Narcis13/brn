---
task: T05
slice: S03
milestone: M001
status: pending
---

## Goal
Card Deletion & Position Adjustment

**Goal:** Implement card deletion with automatic position adjustment for remaining cards.

#### TDD Sequence
- Test file(s): playground/src/routes/cards.test.ts (extend), playground/src/cards/card.service.test.ts (extend)
- Test cases:
  - DELETE /api/cards/:id removes card
  - DELETE validates board ownership
  - Deletion adjusts positions of cards in same column
  - Service uses transaction for atomic deletion
  - Returns 404 for non-existent card
- Implementation file(s): playground/src/routes/cards.ts, playground/src/cards/card.service.ts

#### Must-Haves
**Truths:**
- Deletion is permanent (no soft delete)
- Position gaps filled after deletion
- Atomic operation via transaction
**Artifacts:**
- playground/src/routes/cards.ts — DELETE endpoint, min 25 lines added
- playground/src/cards/card.service.ts — deleteCard function, min 40 lines added
**Key Links:** 
- Uses database transaction for consistency

#### Must-NOT-Haves
- NO cascade delete (cards deleted individually)
- NO trash/archive functionality
- NO undo capability
