# Run 001: Complete Backend — Auth, Boards, Scoped Endpoints

## Context
First run on the auth-and-boards feature. The existing mini-trello codebase had a flat single-board architecture with /api/columns and /api/cards routes, no authentication, and a global seed function. The goal: build the entire backend for JWT auth, multi-board support, and board-scoped endpoints.

## Approach
Implemented the complete backend in a single vertical slice — database schema changes, auth system, board CRUD, and scoped column/card endpoints all together. This ensures the API is coherent and fully testable before tackling the frontend.

Key design choices:
- Used `hono/jwt` for JWT sign/verify (zero additional dependencies)
- Used `Bun.password.hash()` for password hashing (built-in Argon2/bcrypt)
- Auth middleware on all `/api/*` with explicit exclusion for register/login
- Board ownership verification inlined in route handlers (explicit, no middleware magic)
- Schema migration handles legacy columns table (drops and recreates if missing board_id)

## What Was Built

### Files Modified
- `trello/src/db.ts` — Complete rewrite: added users and boards tables, added board_id to columns, new user/board/column CRUD helpers, legacy schema migration, removed global seed function (boards now seed their own columns on creation)
- `trello/src/routes.ts` — Complete rewrite: JWT auth middleware, auth endpoints (register/login/me), board CRUD endpoints, all column/card endpoints scoped under /api/boards/:boardId/*, board ownership verification, old flat routes removed
- `trello/src/routes.test.ts` — Complete rewrite: 31 tests covering auth (register validation, login, me), middleware enforcement, board CRUD with isolation, scoped column/card operations, cross-board access prevention, cascade deletes

## Key Decisions
- **hono/jwt over external library**: Zero dependency — Hono ships with JWT utilities. Discovered that `verify()` now requires explicit algorithm parameter ("HS256") as a security measure against algorithm confusion attacks.
- **Bun.password over manual hashing**: Built-in, secure defaults, no dependency needed.
- **Inline board verification over middleware**: Each route handler explicitly calls `getVerifiedBoard()`. More repetitive but type-safe and debuggable — no implicit context passing.
- **Schema drop-and-recreate for migration**: Old columns table without board_id can't be meaningfully migrated (no users exist to own the data). Clean slate is correct here.
- **No separate auth module**: JWT operations are simple enough to live inline in routes.ts. Adding a separate auth.ts file would be premature abstraction.

## Challenges & Solutions
- **hono/jwt verify requires algorithm**: The `verify()` function threw `JwtAlgorithmRequired` when called without the algorithm parameter. All tests failed with 401. Fixed by passing `"HS256"` as third argument. This is a security improvement in recent Hono versions — explicit algorithm prevents confusion attacks.

## Verification Results
- Tests: 31 passed, 0 failed
- Types: clean (0 errors)
- Build: N/A (frontend not modified)

## Acceptance Criteria Progress
- AC1-AC9 MET this run: full backend complete
- Overall: 9/13 met

## Vault Entries Added
- `patterns/hono-jwt-auth.md` (pattern): JWT auth with hono/jwt
- `anti-patterns/hono-jwt-verify-alg.md` (anti-pattern): verify() requires explicit algorithm
- `decisions/auth-inline-verification.md` (decision): inline board verification over middleware

## What's Next
Run 002 should implement the complete frontend: Login/Register page, Board list dashboard, scoped Board view with navigation. This covers AC10-AC13.
