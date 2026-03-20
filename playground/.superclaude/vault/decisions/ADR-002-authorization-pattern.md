---
title: ADR-002 - Authorization Result Pattern
type: decision
source: M001/S03
created: 2026-03-20
tags: [architecture, security, authorization]
---

## Status
Accepted

## Context
Need to distinguish between "resource doesn't exist" (404) and "not authorized" (403) for proper HTTP responses.

## Decision
Return structured validation results:
```typescript
interface BoardValidationResult {
  exists: boolean;
  isOwner: boolean;
}
```

## Consequences
**Positive:**
- Clear separation of concerns
- Proper HTTP status codes
- Better error messages
- Testable authorization logic

**Negative:**
- Additional interface complexity
- Two-step validation process

## Implementation
Service layer returns validation result, routes map to HTTP status:
- `!exists` → 404 Not Found
- `exists && !isOwner` → 403 Forbidden
- `exists && isOwner` → Continue operation