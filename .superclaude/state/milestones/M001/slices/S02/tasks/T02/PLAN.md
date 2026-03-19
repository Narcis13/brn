---
task: T02
slice: S02
milestone: M001
status: pending
---

## Goal
Board Creation & Listing API

**Goal:** Implement POST /api/boards and GET /api/boards endpoints with auth

#### TDD Sequence
- Test file(s): `playground/src/routes/boards.test.ts`
- Test cases:
  - POST /api/boards creates board with valid name (auth required)
  - POST /api/boards returns 401 without auth token
  - POST /api/boards validates name is non-empty string
  - POST /api/boards returns created board with 201 status
  - GET /api/boards returns user's boards
  - GET /api/boards returns 401 without auth token
  - GET /api/boards returns empty array for new user
  - GET /api/boards only returns current user's boards
- Implementation file(s):
  - `playground/src/routes/boards.ts`
  - `playground/src/server.ts` (register board routes)

#### Must-Haves
**Truths:**
- All board endpoints require authentication
- Users can only see/create their own boards
- Board name validation (non-empty, max 100 chars)
- Proper HTTP status codes (201 for creation, 200 for list)

**Artifacts:**
- `playground/src/routes/boards.ts` — Board routes, 60+ lines, exports boardRoutes Hono instance
- `playground/src/server.ts` — Updated to mount board routes, 2+ lines added

**Key Links:**
- boards.ts imports authMiddleware from auth/middleware.ts
- boards.ts imports board repository functions from boards/board.repo.ts
- server.ts imports boardRoutes from routes/boards.ts

#### Must-NOT-Haves
- No single board GET endpoint yet
- No update/delete endpoints yet
- No board member management
- No board templates or presets
