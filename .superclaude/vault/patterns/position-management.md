---
title: Position Management Pattern
type: pattern
created: 2026-03-20
updated_by: evolver
tags: [patterns, database, ordering]
related: [[patterns/typescript]]
---

## Summary
Pattern for managing ordered positions within collections (cards in columns, items in lists).

## Pattern

### Position Assignment
New items get position = max(existing) + 1

```typescript
const maxPosition = await db.prepare(
  `SELECT COALESCE(MAX(position), -1) as max FROM cards 
   WHERE board_id = ? AND column = ?`
).get(boardId, column);
const position = (maxPosition?.max ?? -1) + 1;
```

### Position Adjustment on Delete
Use transactions to maintain integrity:

```typescript
db.transaction(() => {
  // Delete the card
  deleteCard.run(cardId);
  
  // Shift positions down
  db.prepare(`
    UPDATE cards SET position = position - 1 
    WHERE board_id = ? AND column = ? AND position > ?
  `).run(boardId, column, deletedPosition);
});
```

### Moving Between Collections
1. Remove from source (adjust positions)
2. Insert at destination (calculate new position)
3. Wrap in transaction for atomicity

## When to Use
- Ordered lists requiring user reordering
- Maintaining gaps-free sequences
- Drag-and-drop interfaces

## Anti-Patterns
- Using floats for positions (leads to precision issues)
- Leaving gaps in sequences (complicates UI)
- Not using transactions (risks inconsistent state)