---
task: T06
status: complete
files_modified: [.gitignore, playground/src/client/components/board/BoardView.tsx, playground/src/client/components/board/Column.tsx]
patterns_established: [none]
---

## What Was Built
Drag & Drop Card Movement

## What Downstream Should Know
- `playground/src/client/components/board/DraggableCard.tsx` exports `DraggableCard` (function)
- `playground/src/client/hooks/useDragDrop.ts` exports `useDragDrop` (function)
- `playground/src/client/utils/dragHelpers.ts` exports `calculateNewPosition` (function)
- `playground/src/client/utils/dragHelpers.ts` exports `getCardsForColumn` (function)
- `playground/src/client/utils/dragHelpers.ts` exports `sortCardsByPosition` (function)
- `playground/src/client/utils/dragHelpers.ts` exports `updateCardPositions` (function)
- `playground/src/client/utils/dragHelpers.ts` exports `isValidColumn` (function)


## Artifacts
- `playground/src/client/components/board/DraggableCard.tsx` (123 lines)
  - function **DraggableCard({ 
  card, 
  onUpdate, 
  onDragStart,
  onDragEnd,
  isDragTarget = false,
  disabled = false,
  className = "",
  onClick
}: DraggableCardProps): JSX.Element**
  - imports: Card as CardType from ../../types; Card from ./Card
- `playground/src/client/hooks/useDragDrop.ts` (138 lines)
  - function **useDragDrop(
  cards: Card[],
  moveCard: (cardId: string, targetColumn: CardColumn, targetPosition: number): unknown**
  - imports: Card, CardColumn from ../types
- `playground/src/client/utils/dragHelpers.ts` (85 lines)
  - function **calculateNewPosition(
  cardsInColumn: Card[],
  targetCard: Card | null
): number**
  - function **getCardsForColumn(
  allCards: Card[],
  column: CardColumn
): Card[]**
  - function **sortCardsByPosition(cards: Card[]): Card[]**
  - function **updateCardPositions(
  cards: Card[],
  affectedPosition: number,
  isInsertion = false
): Card[]**
  - function **isValidColumn(column: string | null | undefined): column**
  - imports: Card, CardColumn from ../types

## Test Coverage
- `playground/src/client/components/board/DraggableCard.test.tsx` — 8 tests
- `playground/src/client/hooks/useDragDrop.test.ts` — 11 tests
- **Total: 19 tests**
