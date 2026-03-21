---
task: T05
status: complete
files_modified: [playground/src/cards/card.service.test.ts, playground/src/cards/card.service.ts, playground/src/routes/cards.test.ts, playground/src/routes/cards.ts]
patterns_established: [none]
---

## What Was Built
Card Deletion & Position Adjustment

## What Downstream Should Know
- `playground/src/routes/cards.ts` exports `cardRoutes` (const)
- `playground/src/cards/card.service.ts` exports `validateBoardOwnership` (async function)
- `playground/src/cards/card.service.ts` exports `createCard` (async function)
- `playground/src/cards/card.service.ts` exports `getCardsByBoard` (async function)
- `playground/src/cards/card.service.ts` exports `getCardById` (async function)
- `playground/src/cards/card.service.ts` exports `updateCard` (async function)
- `playground/src/cards/card.service.ts` exports `moveCard` (async function)
- `playground/src/cards/card.service.ts` exports `deleteCard` (async function)
- `playground/src/cards/card.service.ts` exports `BoardValidationResult` (interface)
- `playground/src/cards/card.service.ts` exports `CreateCardParams` (interface)
- `playground/src/cards/card.service.ts` exports `UpdateCardParams` (interface)
- `playground/src/cards/card.service.ts` exports `MoveCardParams` (interface)
- `playground/src/cards/card.service.ts` exports `DeleteCardParams` (interface)


## Artifacts
- `playground/src/routes/cards.ts` (213 lines)
  - const **cardRoutes: unknown**
  - imports: authMiddleware, getAuthContext from ../auth/middleware; getDb from ../db; CardColumn from ../types
- `playground/src/cards/card.service.ts` (448 lines)
  - async function **validateBoardOwnership(
  db: Database,
  boardId: string,
  userId: string
): Promise<BoardValidationResult>**
  - async function **createCard(
  db: Database,
  params: CreateCardParams
): Promise<Card>**
  - async function **getCardsByBoard(
  db: Database,
  boardId: string,
  userId: string
): Promise<Card[]>**
  - async function **getCardById(
  db: Database,
  cardId: string,
  userId: string
): Promise<Card>**
  - async function **updateCard(
  db: Database,
  params: UpdateCardParams
): Promise<Card>**
  - async function **moveCard(
  db: Database,
  params: MoveCardParams
): Promise<Card>**
  - async function **deleteCard(
  db: Database,
  params: DeleteCardParams
): Promise<void>**
  - interface **BoardValidationResult**
  - interface **CreateCardParams**
  - interface **UpdateCardParams**
  - interface **MoveCardParams**
  - interface **DeleteCardParams**
  - imports: Card, CardColumn from ../types

## Test Coverage
- `playground/src/routes/cards.test.ts` — 22 tests
- `playground/src/cards/card.service.test.ts` — 22 tests
- **Total: 44 tests**
