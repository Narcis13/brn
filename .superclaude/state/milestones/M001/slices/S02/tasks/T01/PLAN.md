---
task: T01
slice: S02
milestone: M001
status: pending
---

## Goal
Board Data Model & Repository

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
