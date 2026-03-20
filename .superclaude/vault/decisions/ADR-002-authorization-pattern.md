---
title: Authorization Result Pattern
type: decision
source: M001/S03
tags: [architecture, security, patterns]
---

## Context
Service layer needs to validate board ownership before card operations. How to structure the response?

## Decision
Return structured result object: `{ exists: boolean, isOwner: boolean }`

## Alternatives Considered
1. **Throw exceptions** - Makes control flow harder to follow
2. **Return boolean** - Can't distinguish "not found" from "not authorized"
3. **Return enum** - More complex than needed

## Rationale
- Enables proper HTTP status codes (404 vs 403)
- Clear separation of concerns
- Easy to extend with more validation states
- Explicit about authorization vs existence