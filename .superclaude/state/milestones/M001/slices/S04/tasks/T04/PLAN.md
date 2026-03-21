---
task: T04
slice: S04
milestone: M001
status: pending
strategy: test-after
complexity: complex
---

## Goal
Kanban Board View & Card Display

**Goal:** Implement the kanban board view with three columns and card display

#### TDD Sequence
- Test file(s): playground/src/client/components/board/BoardView.test.tsx, playground/src/client/components/board/Column.test.tsx
- Test cases:
  - Board view loads cards for specific board
  - Cards display in correct columns (todo/doing/done)
  - Cards show title and can expand for description
  - Empty columns show placeholder text
  - Cards are sorted by position
- Implementation file(s):
  - playground/src/client/components/board/BoardView.tsx
  - playground/src/client/components/board/Column.tsx
  - playground/src/client/components/board/Card.tsx
  - playground/src/client/api/cards.ts

#### Must-Haves
**Truths:**
- Board view shows three columns: Todo, Doing, Done
- Cards appear in their assigned columns
- Cards display title prominently
- Cards maintain position order within columns
- Board name displays at top of view

**Artifacts:**
- playground/src/client/components/board/BoardView.tsx — Main board container, 120+ lines
- playground/src/client/components/board/Column.tsx — Column component, 80+ lines
- playground/src/client/components/board/Card.tsx — Card display component, 60+ lines
- playground/src/client/api/cards.ts — Card API client, 80+ lines, CRUD operations

**Key Links:**
- BoardView fetches board and cards data on mount
- Column renders cards in position order
- Card component handles display and actions
- API client manages card endpoints

#### Must-NOT-Haves
- No drag and drop yet (next task)
- No card editing inline
- No card comments or attachments
- No column customization
