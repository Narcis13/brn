# Run 002: Frontend — Auth UI, Board List, Scoped Board View

## Context
After run-001 built the complete backend (auth, boards, scoped endpoints), the frontend was still the old single-board kanban with flat API routes and no auth awareness. All 4 remaining acceptance criteria (AC10-AC13) needed a cohesive frontend rewrite.

## Approach
Tackled all 4 frontend ACs as one step since they're tightly coupled — auth determines navigation, navigation determines which components render, and all API calls need the token. The approach was a clean decomposition into 4 React components with a central App that manages an auth-aware state machine.

## What Was Built

### Files Created
- `trello/src/ui/LoginPage.tsx` — Login/register form with toggle, validation errors, loading state. Calls api.register/login and stores token on success.
- `trello/src/ui/BoardList.tsx` — Responsive grid of board cards with create (inline input), delete (confirmation dialog), empty state, and loading state.
- `trello/src/ui/BoardView.tsx` — Extracted from old App.tsx. Same kanban functionality but all API calls now take boardId parameter for board-scoped routes.

### Files Modified
- `trello/src/ui/api.ts` — Complete rewrite: added token management (localStorage), Authorization header injection, 401 handler with callback, auth endpoints (register/login/getMe), board CRUD, and updated all column/card functions to take boardId.
- `trello/src/ui/App.tsx` — Complete rewrite: state machine (checking → login | board-list → board), token verification on mount, header with username/logout/back-button, renders LoginPage/BoardList/BoardView based on state.
- `trello/public/styles.css` — Added auth page styles (centered card, form inputs, error display, toggle link), board list styles (responsive grid, board cards with hover/delete, new-board form, empty state), updated header (left/right layout, back button, username display), added btn-sm utility.
- `trello/public/index.html` — Removed static `<header>` element (now React-rendered), changed `<main id="root">` to `<div id="root">` since React controls the full page layout.

## Key Decisions
- **State machine over router**: Used a simple `View` discriminated union type (`checking | login | board-list | board`) instead of a routing library. The app has only 3 views — a router would be over-engineering.
- **401 callback pattern**: `api.ts` exports `setOnUnauthorized(cb)` so the App can register a redirect-to-login callback. Cleaner than event emitters or global state.
- **Inline board creation**: New board uses an inline input that appears in the grid rather than a modal. Lighter UX for a simple single-field form.
- **BoardView takes only boardId**: Kept the prop interface minimal. BoardView fetches its own data via `api.fetchColumns(boardId)`.

## Challenges & Solutions
- The old App.tsx used unscoped API calls (fetchColumns with no boardId). Rather than trying to patch the existing component, a clean extraction to BoardView.tsx was faster and less error-prone.
- Had to ensure the CSS worked for both the auth page (full-viewport centered card on blue gradient) and the board-list page (content within the blue background after header). Solved by making auth-page use min-height: 100vh while board-list sits below the header naturally.

## Verification Results
- Tests: 31 passed, 0 failed — all existing backend tests pass unchanged
- Types: clean (0 errors)
- Build: 2 files output successfully

## Acceptance Criteria Progress
- AC10 (Login/Register UI): MET — centered card, toggle, validation errors, auth feedback
- AC11 (Board list): MET — responsive grid, create/delete, empty state, header with username + logout
- AC12 (Board view): MET — kanban scoped to board, back button, board title in header
- AC13 (Token management): MET — localStorage, Authorization header, 401 redirect, survives refresh
- Overall: 13/13 met

## Vault Entries Added
- `patterns/react-auth-state-machine.md`: Discriminated union for auth-aware view routing
- `decisions/inline-board-creation.md`: Inline input over modal for single-field creation

## What's Next
All acceptance criteria are met. Final verification and PR creation.
