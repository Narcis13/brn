---
task: T05
slice: S04
milestone: M001
status: pending
strategy: test-after
complexity: standard
---

## Goal
Card Creation & Basic Actions

**Goal:** Add card creation form and basic card actions (edit, delete)

#### TDD Sequence
- Test file(s): playground/src/client/components/board/CreateCard.test.tsx, playground/src/client/components/board/EditCard.test.tsx
- Test cases:
  - Create card form appears in todo column
  - New cards get added to correct column
  - Edit modal shows current card data
  - Save updates card content
  - Delete removes card with confirmation
- Implementation file(s):
  - playground/src/client/components/board/CreateCard.tsx
  - playground/src/client/components/board/EditCard.tsx
  - playground/src/client/components/board/DeleteCardButton.tsx
  - playground/src/client/hooks/useCards.ts

#### Must-Haves
**Truths:**
- Users can add cards with "+" button in any column
- Card title is required, description optional
- Cards can be edited via modal or dedicated view
- Cards can be deleted with confirmation
- UI updates immediately after actions

**Artifacts:**
- playground/src/client/components/board/CreateCard.tsx — Card creation form, 70+ lines
- playground/src/client/components/board/EditCard.tsx — Card edit modal, 90+ lines
- playground/src/client/components/board/DeleteCardButton.tsx — Delete action, 40+ lines
- playground/src/client/hooks/useCards.ts — Card state management hook, 80+ lines

**Key Links:**
- CreateCard uses useCards hook for state
- EditCard receives card data as props
- useCards hook manages optimistic updates
- Components update board view on changes

#### Must-NOT-Haves
- No bulk card operations
- No card templates
- No card duplication
- No rich text editing
