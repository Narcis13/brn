---
title: Comment CRUD with side effects (activity + auto-watch)
type: pattern
confidence: verified
source: run-002
feature: social-interactions
created: 2026-03-25
---

## Approach
When creating a comment, bundle side effects (activity logging + auto-watch) inside the db-layer function rather than the route handler. This keeps the route handler clean and ensures side effects always fire regardless of call site.

## Example
```typescript
export function createComment(db, cardId, boardId, userId, content): CommentWithUser {
  // 1. Insert comment
  db.query("INSERT INTO comments ...").run(...);
  // 2. Create "commented" activity entry
  createActivity(db, cardId, boardId, "commented", null, userId);
  // 3. Auto-watch card for commenter (idempotent)
  addCardWatcher(db, cardId, userId);
  // 4. Return comment with joined username
  return db.query("SELECT c.*, u.username FROM comments c JOIN users u ...").get(id);
}
```

## When to Use
Any create operation that should trigger related side effects (notifications, activity tracking, subscription). Keep it in the data layer for transactional consistency.
