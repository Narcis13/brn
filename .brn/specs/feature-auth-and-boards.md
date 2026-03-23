---
title: Auth & Multi-Board — JWT authentication with custom boards
status: done
priority: high
---

## What
Add user authentication (register/login with JWT tokens) and multi-board support to the mini-trello app. Users register, log in, and land on a board list dashboard where they can create and delete boards. Each board has its own set of columns and cards. Boards are fully isolated per user.

## Why
Transforms the single-board demo into a real multi-user application. Exercises auth middleware, JWT handling, data isolation, multi-entity relationships (user → boards → columns → cards), and navigation between views. Builds directly on top of the existing mini-trello codebase.

## User Stories
- As a visitor, I want to register with username and password so I can have my own workspace
- As a visitor, I want to log in so I can access my boards
- As a logged-in user, I want to see a dashboard of all my boards
- As a logged-in user, I want to create a new board with a custom name
- As a logged-in user, I want to delete a board I no longer need (and all its columns/cards)
- As a logged-in user, I want to open a board and see its kanban view (existing functionality)
- As a logged-in user, I want to log out

## Requirements

### Auth Endpoints
- POST /api/auth/register — register a new user (body: `{ username, password }`)
  - Username: 3-30 chars, alphanumeric + underscore, unique
  - Password: minimum 6 chars
  - Hash password with a secure algorithm before storing
  - Response: `{ token, user: { id, username } }`
  - 409 if username taken, 400 if validation fails
- POST /api/auth/login — authenticate (body: `{ username, password }`)
  - Response: `{ token, user: { id, username } }`
  - 401 if credentials invalid
- GET /api/auth/me — get current user from token
  - Response: `{ id, username }`
  - 401 if no/invalid token

### Auth Middleware
- All `/api/*` routes except `/api/auth/register` and `/api/auth/login` require a valid JWT
- Token sent in `Authorization: Bearer <token>` header
- JWT payload: `{ userId, username }`
- JWT secret: from `JWT_SECRET` env var (fallback to a default for dev)
- Invalid/expired token returns 401

### Board Endpoints
- GET /api/boards — list all boards for the authenticated user, ordered by created_at desc
  - Response: `{ boards: [{ id, title, createdAt }] }`
- POST /api/boards — create a board (body: `{ title }`)
  - Title required, non-empty
  - Response: `{ id, title, userId, createdAt }`
- DELETE /api/boards/:id — delete a board and all its columns/cards (cascade)
  - 404 if board not found or doesn't belong to user

### Existing Endpoints — Scoped to Board
- All existing column/card endpoints gain a board context:
  - GET /api/boards/:boardId/columns — list columns for a specific board
  - POST /api/boards/:boardId/columns — create column within a board
  - PATCH /api/boards/:boardId/columns/:id — update column
  - DELETE /api/boards/:boardId/columns/:id — delete column
  - POST /api/boards/:boardId/cards — create card
  - PATCH /api/boards/:boardId/cards/:id — update card
  - DELETE /api/boards/:boardId/cards/:id — delete card
- Server verifies the board belongs to the authenticated user before any operation
- The old flat `/api/columns` and `/api/cards` routes are removed

### Data Model Changes (SQLite)
- **users** table: `id` (TEXT PK, nanoid), `username` (TEXT UNIQUE NOT NULL), `password_hash` (TEXT NOT NULL), `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
- **boards** table: `id` (TEXT PK, nanoid), `title` (TEXT NOT NULL), `user_id` (TEXT NOT NULL FK → users.id ON DELETE CASCADE), `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
- **columns** table: add `board_id` (TEXT NOT NULL FK → boards.id ON DELETE CASCADE) — existing columns without a board_id should be handled during migration
- **cards** table: unchanged (still FK → columns.id ON DELETE CASCADE)
- Seed behavior: when a user creates a new board, seed it with 3 default columns ("To Do", "In Progress", "Done")

### UI Flow
- **Login/Register page**: shown when not authenticated
  - Toggle between Login and Register forms
  - Username + password fields, submit button
  - Error messages for validation failures, wrong credentials, username taken
- **Board list page** (after login):
  - Grid/list of board cards showing title and creation date
  - "New Board" button/card — click to create (inline input or modal)
  - Delete button on each board with confirmation
  - Empty state: "No boards yet. Create your first board!"
  - User's name in header with logout button
- **Board view** (click a board):
  - Existing kanban UI, but scoped to the selected board
  - Back button/breadcrumb to return to board list
  - Board title shown in header

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite
- Frontend: React + ReactDOM
- Build: bun build (bundle to trello/public/dist/)
- Styling: CSS file (extend trello/public/styles.css)
- Auth: JWT (use a lightweight JWT library compatible with Bun)
- Password hashing: use Bun's built-in crypto or a lightweight library
- All code lives under `trello/`

## UI Requirements
- Login/Register: centered card on a clean background, form fields, toggle link ("Don't have an account? Register" / "Already have an account? Log in")
- Board list: responsive grid of board cards (~200px wide), hover effect, clean spacing
- Board view: existing kanban with added breadcrumb navigation
- Token stored in localStorage, included in all API requests via Authorization header
- On 401 response: clear token, redirect to login
- Loading states for auth operations and board list
- Consistent styling with existing Trello-like theme

## Edge Cases
- Expired JWT: return 401, frontend clears token and shows login
- Duplicate username on register: 409 with clear message
- Empty board title: reject with validation error
- Delete board with many columns/cards: cascade delete works correctly
- User tries to access another user's board: 404 (not 403, to avoid leaking existence)
- Password too short: reject at registration
- Concurrent sessions: JWT is stateless, multiple logins work naturally
- Token in localStorage survives page refresh: user stays logged in

## Out of Scope
- OAuth / social login
- Email verification
- Password reset / change password
- Board renaming / editing
- Board sharing / collaboration
- User profile / settings
- Token refresh mechanism (tokens are long-lived for simplicity)
- Column reordering (still out of scope from original)
- Rate limiting on auth endpoints
