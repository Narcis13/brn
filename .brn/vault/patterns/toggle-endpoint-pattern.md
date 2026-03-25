---
title: Toggle endpoint pattern for add/remove operations
type: pattern
confidence: verified
source: run-003
feature: social-interactions
created: 2026-03-25
---

## Approach
For resources where a user can add or remove their own entry (reactions, watchers, likes), use a single POST endpoint that checks for existence and toggles. The db function returns the resulting state so the route handler doesn't need to know which branch was taken.

## Example
```typescript
export function toggleCardWatcher(db, cardId, userId): boolean {
  const existing = db.query("SELECT 1 FROM card_watchers WHERE card_id = ? AND user_id = ?").get(cardId, userId);
  if (existing) {
    db.query("DELETE FROM card_watchers WHERE card_id = ? AND user_id = ?").run(cardId, userId);
    return false; // no longer watching
  }
  db.query("INSERT INTO card_watchers (card_id, user_id) VALUES (?, ?)").run(cardId, userId);
  return true; // now watching
}

// Route: single POST, returns the new state
app.post("/api/boards/:boardId/cards/:cardId/watch", (c) => {
  const watching = toggleCardWatcher(db, cardId, userId);
  return c.json({ watching });
});
```

## When to Use
Any user-specific boolean association (watching, favoriting, following, liking) where the UI just needs a toggle button. Avoids needing separate PUT/DELETE endpoints and simplifies the frontend to a single fetch call.
