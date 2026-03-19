---
task: T03
slice: S02
milestone: M001
status: pending
---

## Goal
Individual Board Operations API

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
