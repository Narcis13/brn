---
task: T03
slice: S04
milestone: M001
status: pending
strategy: test-after
complexity: standard
---

## Goal
Board List & Management UI

**Goal:** Create board listing, creation, and basic management interface

#### TDD Sequence
- Test file(s): playground/src/client/components/boards/BoardList.test.tsx, playground/src/client/components/boards/CreateBoard.test.tsx
- Test cases:
  - Board list fetches and displays user's boards
  - Create board form validates name input
  - New board appears in list after creation
  - Board deletion removes from list
  - Empty state shown when no boards
- Implementation file(s):
  - playground/src/client/components/boards/BoardList.tsx
  - playground/src/client/components/boards/CreateBoard.tsx
  - playground/src/client/components/boards/BoardCard.tsx
  - playground/src/client/api/boards.ts

#### Must-Haves
**Truths:**
- Authenticated users see their boards list
- Users can create new boards with names
- Board cards show name and timestamps
- Boards can be deleted with confirmation
- Clicking a board navigates to board view

**Artifacts:**
- playground/src/client/components/boards/BoardList.tsx — Board listing page, 100+ lines
- playground/src/client/components/boards/CreateBoard.tsx — Board creation form, 60+ lines
- playground/src/client/components/boards/BoardCard.tsx — Individual board display, 40+ lines
- playground/src/client/api/boards.ts — Board API client, 60+ lines, CRUD operations

**Key Links:**
- BoardList uses api/boards.ts for data fetching
- CreateBoard emits event to refresh board list
- BoardCard handles click to navigate and delete action
- API client includes auth token in requests

#### Must-NOT-Haves
- No board sharing or collaboration
- No board templates or presets
- No board archiving (only delete)
- No complex board settings
