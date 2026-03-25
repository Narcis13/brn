---
title: Frontend API client extension pattern
type: pattern
confidence: verified
source: run-005
feature: social-interactions
created: 2026-03-25
---

## Approach
When adding new backend endpoints, update the frontend API client (`api.ts`) in a structured way:
1. Add interface types mirroring backend response shapes
2. Update existing interfaces that gained new fields (e.g., CardDetail getting timeline)
3. Group new API functions by domain (Members, Comments, Reactions, Watchers)
4. Keep the `request<T>()` helper generic — all new functions use the same pattern

## Example
```typescript
// Types mirror backend exactly
export interface TimelineComment {
  type: "comment";
  id: string;
  content: string;
  user_id: string;
  username: string;
  // ...
}

// Functions use consistent pattern
export function toggleWatch(boardId: string, cardId: string): Promise<{ watching: boolean }> {
  return request(`/boards/${boardId}/cards/${cardId}/watch`, { method: "POST" });
}
```

## When to Use
Any time new API endpoints are added to the backend that the frontend needs to consume. Do this as a first step before building UI, so components can be written against the types.
