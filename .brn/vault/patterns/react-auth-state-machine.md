---
title: Discriminated union for auth-aware view routing in React
type: pattern
confidence: verified
source: run-002
feature: auth-and-boards
created: 2026-03-23
---

## Approach
Use a TypeScript discriminated union type for the app's view state instead of a routing library. The `kind` field drives which component renders, and type narrowing provides access to view-specific data (e.g., `board` is only available when `kind === "board"`).

## Example
```typescript
type View =
  | { kind: "checking" }
  | { kind: "login" }
  | { kind: "board-list" }
  | { kind: "board"; board: Board };

const [view, setView] = useState<View>({ kind: "checking" });

// On mount: verify token
useEffect(() => {
  const token = api.getToken();
  if (!token) { setView({ kind: "login" }); return; }
  api.getMe()
    .then(user => { setUser(user); setView({ kind: "board-list" }); })
    .catch(() => { api.clearToken(); setView({ kind: "login" }); });
}, []);

// In render: type narrowing gives access to board
if (view.kind === "board") return <BoardView boardId={view.board.id} />;
```

## When to Use
Apps with 2-4 views where a routing library would be over-engineering. The discriminated union gives type-safe view transitions without any dependencies.
