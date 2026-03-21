---
slice: S03
milestone: M001
status: planned
demo_sentence: "Card Operations"
---

## Tasks

### T01: Card Data Model & Repository
**Goal:** Create the card entity with column tracking and implement database operations for cards.

#### TDD Sequence
- Test file(s): src/cards/card.repo.test.ts
- Test cases: 
  - createCard creates a card with valid board reference
  - findCardById returns card when exists
  - findCardsByBoardId returns all cards for a board
  - findCardsByBoardAndColumn filters by column
  - updateCard modifies card properties
  - deleteCard removes card from database
  - position tracking within columns
- Implementation file(s): src/cards/card.repo.ts, src/types.ts, src/db.ts

#### Must-Haves
**Truths:** 
- Cards belong to boards via foreign key
- Cards have a column field (todo/doing/done)
- Cards have position within their column
- Card operations respect board ownership
**Artifacts:** 
- src/types.ts — Card and NewCard interfaces, min 15 lines, exports Card, NewCard
- src/db.ts — cards table migration, min 10 lines, exports initDb
- src/cards/card.repo.ts — repository functions, min 120 lines, exports createCard, findCardById, etc.
**Key Links:** 
- card.repo.ts imports Database from bun:sqlite
- card.repo.ts imports Card, NewCard from types.ts

#### Must-NOT-Haves
- NO column/list as separate entity (columns are fixed strings)
- NO drag-and-drop logic (that's frontend in S06)
- NO card comments or attachments
- NO card assignment to users

### T02: Card Creation & Board Validation
**Goal:** Implement card creation API endpoint with board ownership validation.

#### TDD Sequence
- Test file(s): src/cards/card.service.test.ts, src/routes/cards.test.ts
- Test cases:
  - Service validates board exists before card creation
  - Service validates user owns board
  - Service sets initial position for new cards
  - POST /api/cards creates card with valid input
  - POST /api/cards returns 404 for non-existent board
  - POST /api/cards returns 403 for board not owned by user
- Implementation file(s): src/cards/card.service.ts, src/routes/cards.ts, src/app.ts

#### Must-Haves
**Truths:** 
- User must own the board to create cards
- New cards get position at end of column
- Card title is required, description optional
**Artifacts:** 
- src/cards/card.service.ts — validation logic, min 80 lines, exports validateBoardOwnership, createCard
- src/routes/cards.ts — POST endpoint, min 40 lines, exports cards router
- src/app.ts — updated with cards route, min 1 line added
**Key Links:** 
- card.service.ts imports from board.repo.ts
- routes/cards.ts imports authMiddleware from auth/middleware.ts
- app.ts imports cards from routes/cards.ts

#### Must-NOT-Haves
- NO bulk card creation
- NO card templates or presets
- NO due dates or priorities

### T03: Card Retrieval & Listing
**Goal:** Implement endpoints to get cards by board and individual card details.

#### TDD Sequence
- Test file(s): src/routes/cards.test.ts (extend existing)
- Test cases:
  - GET /api/boards/:boardId/cards returns cards for owned board
  - GET /api/boards/:boardId/cards returns empty array for board with no cards
  - GET /api/boards/:boardId/cards returns 403 for unowned board
  - GET /api/cards/:id returns card details
  - GET /api/cards/:id validates board ownership
  - Cards returned in position order within columns
- Implementation file(s): src/routes/cards.ts, src/routes/boards.ts

#### Must-Haves
**Truths:** 
- Cards listed by board, not globally
- Cards sorted by position within each column
- Board ownership checked for all queries
**Artifacts:** 
- src/routes/cards.ts — GET endpoints, min 80 lines total
- src/routes/boards.ts — nested cards endpoint, min 20 lines added
**Key Links:** 
- routes/boards.ts imports from card.service.ts

#### Must-NOT-Haves
- NO global card search
- NO cross-board card queries
- NO pagination (not needed for MVP)

### T04: Card Updates & Column Movement
**Goal:** Enable editing card content and moving cards between columns with position management.

#### TDD Sequence
- Test file(s): src/routes/cards.test.ts (extend), src/cards/card.service.test.ts (extend)
- Test cases:
  - PUT /api/cards/:id updates title and description
  - PUT /api/cards/:id validates board ownership
  - Moving card to different column updates position
  - Moving within column updates positions correctly
  - Service recalculates positions to prevent gaps
  - Cannot move card to invalid column
- Implementation file(s): src/routes/cards.ts, src/cards/card.service.ts

#### Must-Haves
**Truths:** 
- Column moves reset position to end of target column
- Position updates maintain order integrity
- Only title, description, column, position updatable
**Artifacts:** 
- src/routes/cards.ts — PUT endpoint, min 40 lines added
- src/cards/card.service.ts — updateCard, moveCard functions, min 60 lines added
**Key Links:** 
- card.service.ts uses transaction for position updates

#### Must-NOT-Haves
- NO complex drag-drop position calculations
- NO cross-board card movement
- NO card history tracking

### T05: Card Deletion & Position Adjustment
**Goal:** Implement card deletion with automatic position adjustment for remaining cards.

#### TDD Sequence
- Test file(s): src/routes/cards.test.ts (extend), src/cards/card.service.test.ts (extend)
- Test cases:
  - DELETE /api/cards/:id removes card
  - DELETE validates board ownership
  - Deletion adjusts positions of cards in same column
  - Service uses transaction for atomic deletion
  - Returns 404 for non-existent card
- Implementation file(s): src/routes/cards.ts, src/cards/card.service.ts

#### Must-Haves
**Truths:** 
- Deletion is permanent (no soft delete)
- Position gaps filled after deletion
- Atomic operation via transaction
**Artifacts:** 
- src/routes/cards.ts — DELETE endpoint, min 25 lines added
- src/cards/card.service.ts — deleteCard function, min 40 lines added
**Key Links:** 
- Uses database transaction for consistency

#### Must-NOT-Haves
- NO cascade delete (cards deleted individually)
- NO trash/archive functionality
- NO undo capability

## Boundary Contracts

### Card Entity Contract
```typescript
// src/types.ts additions
export interface Card {
  id: string;           // UUID v4
  boardId: string;      // FK to boards
  title: string;        // Required, trimmed
  description?: string; // Optional, trimmed
  column: 'todo' | 'doing' | 'done'; // Fixed columns
  position: number;     // 0-based within column
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

export interface NewCard {
  boardId: string;
  title: string;
  description?: string;
  column: 'todo' | 'doing' | 'done';
}
```

### Repository Interface Contract
```typescript
// Pattern for card.repo.ts
export async function createCard(db: Database, card: NewCard): Promise<Card>;
export async function findCardById(db: Database, cardId: string): Promise<Card | null>;
export async function findCardsByBoardId(db: Database, boardId: string): Promise<Card[]>;
export async function findCardsByBoardAndColumn(db: Database, boardId: string, column: string): Promise<Card[]>;
export async function updateCard(db: Database, cardId: string, updates: Partial<Card>): Promise<Card | null>;
export async function deleteCard(db: Database, cardId: string): Promise<boolean>;
```

### Service Layer Contract
```typescript
// card.service.ts key functions
export async function validateCardOwnership(db: Database, cardId: string, userId: string): Promise<boolean>;
export async function createCardForBoard(db: Database, userId: string, boardId: string, card: NewCard): Promise<Card>;
export async function moveCard(db: Database, cardId: string, newColumn: string, newPosition?: number): Promise<Card>;
export async function deleteCardWithPositionAdjustment(db: Database, cardId: string): Promise<void>;
```

### API Endpoint Contract
```
POST   /api/cards                     — Create card
GET    /api/boards/:boardId/cards     — List cards for board  
GET    /api/cards/:id                 — Get card details
PUT    /api/cards/:id                 — Update card
DELETE /api/cards/:id                 — Delete card
```

### Database Schema Contract
```sql
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  column      TEXT NOT NULL CHECK(column IN ('todo', 'doing', 'done')),
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX idx_cards_board_id ON cards(board_id);
CREATE INDEX idx_cards_board_column ON cards(board_id, column);
```

## Upstream Summaries

### S01: Authentication Foundation
---
slice: S01
status: complete
tasks_completed: [T01, T02, T03, T04]
---

## Demo Sentence
After this, the user can sign up with email/password, log in, and receive a JWT token

## What Was Built
- **T01:** Project Foundation & User Repository
- **T02:** Password & JWT Utilities
- **T03:** Auth Endpoints (Signup & Login)
- **T04:** Auth Middleware & Protected Routes

### S02: Board Management
---
slice: S02
status: complete
tasks_completed: [T01, T02, T03, T04]
---

## Demo Sentence
Users can create boards with names, list their boards, get board details, update board names, and delete boards they own

## What Was Built
- **T01:** Board Data Model & Repository
- **T02:** Board Creation & Listing API
- **T03:** Individual Board Operations API
- **T04:** Board Service Layer & Validation