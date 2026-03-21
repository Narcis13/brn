---
task: T06
slice: S04
milestone: M001
status: pending
strategy: test-after
complexity: complex
---

## Goal
Drag & Drop Card Movement

**Goal:** Implement drag-and-drop functionality to move cards between columns

#### TDD Sequence
- Test file(s): playground/src/client/components/board/DraggableCard.test.tsx, playground/src/client/hooks/useDragDrop.test.ts
- Test cases:
  - Cards become draggable on mouse down
  - Drop zones highlight when dragging
  - Cards move to new column on drop
  - Position updates when dropping between cards
  - API updates on successful drop
- Implementation file(s):
  - playground/src/client/components/board/DraggableCard.tsx
  - playground/src/client/hooks/useDragDrop.ts
  - playground/src/client/utils/dragHelpers.ts

#### Must-Haves
**Truths:**
- Cards can be dragged between columns
- Visual feedback during drag operation
- Cards can be reordered within columns
- Position calculations handle edge cases
- Optimistic UI updates with rollback on error

**Artifacts:**
- playground/src/client/components/board/DraggableCard.tsx — Wrapper for draggable cards, 100+ lines
- playground/src/client/hooks/useDragDrop.ts — Drag and drop logic hook, 120+ lines
- playground/src/client/utils/dragHelpers.ts — Position calculation utilities, 60+ lines

**Key Links:**
- DraggableCard wraps Card component
- useDragDrop hook manages drag state
- Hook calls card API to update position
- Helpers calculate new positions

#### Must-NOT-Haves
- No touch/mobile drag support
- No multi-card selection
- No drag between boards
- No keyboard-based movement
