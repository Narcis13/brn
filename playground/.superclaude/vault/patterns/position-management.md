---
title: Position Management Pattern
type: pattern
created: 2026-03-20
tags: [database, transactions, ordering]
related: [[architecture/overview]]
---

## Summary
Pattern for managing ordered positions within collections (cards in columns).

## Pattern

### New Item Position
New items get position = count of existing items:
```typescript
const existingCards = await findCardsByBoardAndColumn(db, boardId, column);
const position = existingCards.length;
```

### Position Adjustment on Delete
Use transaction to atomically delete and adjust positions:
```typescript
db.transaction(() => {
  deleteCard(db, cardId);
  db.run(`
    UPDATE cards 
    SET position = position - 1 
    WHERE board_id = ? AND column_name = ? AND position > ?
  `, [boardId, column, deletedPosition]);
});
```

### Moving Between Collections
1. Remove from source (adjust positions)
2. Add to target at end
3. Use transaction for atomicity

## When to Use
- Ordered lists (cards, tasks, items)
- Drag-and-drop interfaces
- Any position-sensitive data

## Anti-Patterns
- Gaps in position sequences
- Non-atomic position updates
- Client-side position calculation
- Floating point positions