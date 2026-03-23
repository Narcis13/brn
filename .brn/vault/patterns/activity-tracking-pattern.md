# Activity Tracking Pattern

## Problem
Need to track all changes to entities (cards) for audit trail and user visibility.

## Solution
Create a separate activity table with flexible JSON detail field and wrapper functions that combine updates with activity logging.

## Implementation

```typescript
// Activity table schema
CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  // enum: created, moved, edited, etc.
  detail TEXT DEFAULT NULL,  // JSON for action-specific data
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
)

// Wrapper function pattern
export function updateCardWithActivity(
  db: Database,
  id: string,
  boardId: string,
  updates: CardUpdateParams
): CardRow | null {
  // Track what changed
  const existing = getCardById(db, id);
  const changes = detectChanges(existing, updates);
  
  // Perform update
  const updated = updateCard(db, id, updates);
  if (!updated) return null;
  
  // Create appropriate activity
  if (changes.columnChanged) {
    createActivity(db, id, boardId, "moved", {
      from: oldColumn.title,
      to: newColumn.title
    });
  } else if (changes.hasChanges) {
    createActivity(db, id, boardId, "edited");
  }
  
  return updated;
}
```

## Benefits
- Automatic activity logging with business logic operations
- Flexible detail field supports different action types
- Clean separation between core operations and activity tracking
- Easy to add new activity types

## When to Use
- Any entity that needs audit trail
- User-facing change history
- Debugging production issues
- Compliance requirements

## Confidence
`verified` - Successfully implemented and tested for card activity tracking