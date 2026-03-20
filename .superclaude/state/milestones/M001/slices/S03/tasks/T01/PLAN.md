---
task: T01
slice: S03
milestone: M001
status: complete
---

## Goal
Card Data Model & Repository

**Goal:** Create the card entity with column tracking and implement database operations for cards.

#### TDD Sequence
- Test file(s): playground/src/cards/card.repo.test.ts
- Test cases: 
  - createCard creates a card with valid board reference
  - findCardById returns card when exists
  - findCardsByBoardId returns all cards for a board
  - findCardsByBoardAndColumn filters by column
  - updateCard modifies card properties
  - deleteCard removes card from database
  - position tracking within columns
- Implementation file(s): playground/src/cards/card.repo.ts, src/types.ts, src/db.ts

#### Must-Haves
**Truths:** 
- Cards belong to boards via foreign key
- Cards have a column field (todo/doing/done)
- Cards have position within their column
- Card operations respect board ownership
**Artifacts:** 
- playground/src/types.ts — Card and NewCard interfaces, min 15 lines, exports Card, NewCard
- playground/src/db.ts — cards table migration, min 10 lines, exports initDb
- playground/src/cards/card.repo.ts — repository functions, min 120 lines, exports createCard, findCardById, etc.
**Key Links:** 
- card.repo.ts imports Database from bun:sqlite
- card.repo.ts imports Card, NewCard from types.ts

#### Must-NOT-Haves
- NO column/list as separate entity (columns are fixed strings)
- NO drag-and-drop logic (that's frontend in S06)
- NO card comments or attachments
- NO card assignment to users
