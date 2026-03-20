---
task: T01
slice: S03
milestone: M001
status: complete
---

## What Was Built
Card data model and repository layer with full CRUD operations.

## Artifacts
- `playground/src/types.ts` — Added Card, NewCard interfaces and CardColumn type
- `playground/src/db.ts` — Added cards table migration with board_id foreign key, column_name, position, timestamps
- `playground/src/cards/card.repo.ts` — Repository with createCard, findCardById, findCardsByBoardId, findCardsByBoardAndColumn, updateCard, deleteCard
- `playground/src/cards/card.repo.test.ts` — 12 tests covering all CRUD operations and position tracking

## Decisions
- Columns are fixed strings (todo/doing/done) — not separate entities
- Position is tracked as integer within each column

## Test Results
12 pass, 0 fail
