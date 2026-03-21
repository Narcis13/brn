---
task: T04
slice: S02
milestone: M001
status: pending
---

## Goal
Board Service Layer & Validation

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
