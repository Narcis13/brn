---
slice: S02
milestone: M001
status: planned
---

## Tasks

### T01: Board Data Model & Repository
**Goal:** Create board database schema, types, and repository layer for CRUD operations

#### TDD Sequence
- Test file(s): `playground/src/boards/board.repo.test.ts`
- Test cases: 
  - createBoard creates board with valid data
  - createBoard generates UUID id
  - findBoardsByUserId returns user's boards
  - findBoardsByUserId returns empty array for user with no boards
  - findBoardById returns board when exists
  - findBoardById returns null when not found
  - updateBoard updates board name
  - deleteBoard removes board from database
- Implementation file(s): 
  - `playground/src/boards/board.repo.ts`
  - `playground/src/types.ts` (update with Board types)
  - `playground/src/db.ts` (add boards table migration)

#### Must-Haves
**Truths:** 
- Boards table exists with id, name, user_id, created_at, updated_at columns
- Board IDs are UUID v4
- Boards are owned by users (user_id foreign key)
- Repository functions handle all database operations

**Artifacts:** 
- `playground/src/types.ts` — Board and NewBoard interfaces, 5+ lines, exports Board, NewBoard
- `playground/src/boards/board.repo.ts` — Repository functions, 50+ lines, exports createBoard, findBoardsByUserId, findBoardById, updateBoard, deleteBoard
- `playground/src/db.ts` — Updated with boards table migration, 10+ lines added

**Key Links:** 
- board.repo.ts imports Board, NewBoard from types.ts
- board.repo.ts imports db from db.ts

#### Must-NOT-Haves
- No API routes yet
- No authorization logic in repository
- No list/card models or relationships
- No board sharing or collaboration features

### T02: Board Creation & Listing API
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

### T03: Individual Board Operations API
**Goal:** Implement GET/PUT/DELETE /api/boards/:id endpoints with ownership validation

#### TDD Sequence
- Test file(s): `playground/src/routes/boards.test.ts` (extend existing)
- Test cases:
  - GET /api/boards/:id returns board when user owns it
  - GET /api/boards/:id returns 404 when board not found
  - GET /api/boards/:id returns 404 when user doesn't own board (security through obscurity)
  - PUT /api/boards/:id updates board name
  - PUT /api/boards/:id validates new name
  - PUT /api/boards/:id returns 404 when user doesn't own board
  - DELETE /api/boards/:id removes board
  - DELETE /api/boards/:id returns 404 when user doesn't own board
  - All endpoints require authentication
- Implementation file(s):
  - `playground/src/routes/boards.ts` (extend with new endpoints)

#### Must-Haves
**Truths:**
- Ownership check on every operation (user can only access their boards)
- Consistent 404 for both "not found" and "not authorized" (no information leak)
- Name validation on updates
- Proper HTTP methods (GET, PUT, DELETE)

**Artifacts:**
- `playground/src/routes/boards.ts` — Extended with individual board operations, 120+ lines total

**Key Links:**
- Uses existing auth context from middleware
- Calls repository functions for all database operations

#### Must-NOT-Haves
- No cascade delete of lists/cards (not implemented yet)
- No board archiving (just hard delete)
- No board duplication
- No activity tracking or audit logs

### T04: Board Service Layer & Validation
**Goal:** Extract business logic into service layer with proper validation and error handling

#### TDD Sequence
- Test file(s): `playground/src/boards/board.service.test.ts`
- Test cases:
  - validateBoardName throws for empty string
  - validateBoardName throws for string over 100 chars
  - validateBoardName passes for valid names
  - validateBoardOwnership returns true when user owns board
  - validateBoardOwnership returns false when user doesn't own board
  - validateBoardOwnership returns false when board doesn't exist
  - Service functions properly handle repository errors
- Implementation file(s):
  - `playground/src/boards/board.service.ts`
  - `playground/src/routes/boards.ts` (refactor to use service layer)

#### Must-Haves
**Truths:**
- Central validation logic for board operations
- Consistent error handling across endpoints
- Service layer encapsulates business rules
- Clean separation between HTTP and business logic

**Artifacts:**
- `playground/src/boards/board.service.ts` — Service functions and validation, 80+ lines, exports validateBoardName, validateBoardOwnership, service functions
- `playground/src/routes/boards.ts` — Refactored to use service layer, similar line count

**Key Links:**
- board.service.ts imports repository functions from board.repo.ts
- routes/boards.ts imports service functions from boards/board.service.ts

#### Must-NOT-Haves
- No complex business rules yet (just basic CRUD)
- No board limits per user
- No default boards creation
- No board statistics or analytics