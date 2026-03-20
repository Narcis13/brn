---
slice: S04
milestone: M001
status: planned
---

## Tasks

### T01: React Foundation & Routing
---
strategy: verify-only
complexity: simple
---
**Goal:** Set up React application foundation with basic routing structure

#### TDD Sequence
- Test file(s): N/A (infrastructure setup)
- Test cases: N/A
- Implementation file(s): 
  - playground/public/index.html
  - playground/src/client/index.tsx
  - playground/src/client/App.tsx
  - playground/src/client/types.ts

#### Must-Haves
**Truths:** 
- React app renders in browser at localhost:3000
- Basic routing structure exists for auth and board views
- TypeScript types mirror backend types for frontend use

**Artifacts:**
- playground/public/index.html — HTML entry point, 15+ lines, div#root mount point
- playground/src/client/index.tsx — React entry point, 10+ lines, renders App
- playground/src/client/App.tsx — Main app component, 20+ lines, basic routing
- playground/src/client/types.ts — Frontend type definitions, 40+ lines, User/Board/Card interfaces

**Key Links:**
- index.tsx imports ReactDOM and App component
- App.tsx uses React Router (or simple state-based routing)
- types.ts mirrors backend types from playground/src/types.ts

#### Must-NOT-Haves
- No actual API calls yet (just routing shell)
- No authentication logic implementation
- No styling or CSS frameworks
- No external UI libraries beyond React

### T02: Authentication Components & Flow
---
strategy: test-after
complexity: standard
---
**Goal:** Create login/signup forms and auth state management with API integration

#### TDD Sequence
- Test file(s): playground/src/client/components/auth/Login.test.tsx, playground/src/client/components/auth/Signup.test.tsx
- Test cases: 
  - Form renders with email/password fields
  - Validation shows errors for invalid input
  - Successful login stores token and redirects
  - API errors display to user
- Implementation file(s):
  - playground/src/client/components/auth/Login.tsx
  - playground/src/client/components/auth/Signup.tsx
  - playground/src/client/api/auth.ts
  - playground/src/client/contexts/AuthContext.tsx

#### Must-Haves
**Truths:**
- User can sign up with email/password
- User can log in with credentials
- JWT token is stored (localStorage or memory)
- Protected routes redirect to login when unauthorized
- Auth context provides current user state

**Artifacts:**
- playground/src/client/components/auth/Login.tsx — Login form component, 80+ lines
- playground/src/client/components/auth/Signup.tsx — Signup form component, 80+ lines
- playground/src/client/api/auth.ts — Auth API client, 40+ lines, signup/login functions
- playground/src/client/contexts/AuthContext.tsx — Auth context provider, 60+ lines

**Key Links:**
- Auth components use api/auth.ts for API calls
- AuthContext wraps App and provides auth state
- API client handles token storage/retrieval
- Forms validate input before submission

#### Must-NOT-Haves
- No complex session management
- No remember me functionality
- No password reset flow
- No social auth integrations

### T03: Board List & Management UI
---
strategy: test-after
complexity: standard
---
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

### T04: Kanban Board View & Card Display
---
strategy: test-after
complexity: complex
---
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

### T05: Card Creation & Basic Actions
---
strategy: test-after
complexity: standard
---
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

### T06: Drag & Drop Card Movement
---
strategy: test-after
complexity: complex
---
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