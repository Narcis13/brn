---
title: Multi-level board membership authorization
type: pattern
confidence: verified
source: run-001
feature: social-interactions
created: 2026-03-25
---

## Approach
Use a board_members join table for authorization instead of checking board.user_id directly. Two helper functions provide clean separation:
- `isBoardMember(db, boardId, userId)` — for general access (view, edit)
- `isBoardOwner(db, boardId, userId)` — for privileged operations (delete board, invite/remove members)

The `getVerifiedBoard()` function checks membership, while individual endpoints add ownership checks where needed.

## Example
```typescript
// General access: 404 for non-members (no information leakage)
function getVerifiedBoard(db, boardId, userId) {
  const board = getBoardById(db, boardId);
  if (!board || !isBoardMember(db, boardId, userId)) return null;
  return board;
}

// Owner-only: 404 for non-members, 403 for members without ownership
app.delete("/api/boards/:id", (c) => {
  if (!board || !isBoardMember(db, boardId, userId)) return 404;
  if (!isBoardOwner(db, boardId, userId)) return 403;
  // proceed...
});
```

## When to Use
Any multi-user resource that needs role-based access control. The pattern naturally extends to additional roles (admin, viewer) by adding role checks.
