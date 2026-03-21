---
task: T02
slice: S05
milestone: M001
status: pending
strategy: tdd-strict
complexity: simple
---

## Goal
Board Navigation & Header Actions

**Goal:** Add back navigation to BoardView and board name editing to board header

#### TDD Sequence
- Test file(s): playground/src/client/components/board/BoardHeader.test.tsx
- Test cases: renders board name, back button calls navigation, edit mode toggles on click, save updates board name, cancel restores original name
- Implementation file(s): playground/src/client/components/board/BoardHeader.tsx

#### Must-Haves
**Truths:**
- Back button navigates from board view to boards list
- Board name becomes editable on click
- Save button updates board name via API
- Cancel button restores original name
- Escape key cancels editing

**Artifacts:**
- playground/src/client/components/board/BoardHeader.tsx — board header component, 100+ lines, exports BoardHeader
- playground/src/client/components/board/BoardHeader.test.tsx — test file, 80+ lines

**Key Links:**
- BoardHeader imports updateBoard from api/boards.ts
- BoardView imports and uses BoardHeader
- BoardHeader receives board, onBack, and onBoardUpdate props

#### Must-NOT-Haves
- Do not add board sharing or permissions
- Do not add board settings beyond name
- Do not implement board duplication
- Do not add board color/icon customization
