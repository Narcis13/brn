---
title: TypeScript Literal Types in Tests
type: decision
confidence: verified
source: calendar-view AC4 test implementation
created: 2026-03-24
---

## Choice
Avoid explicit type annotations when testing literal type comparisons to prevent TypeScript errors about non-overlapping types.

## Alternatives
1. **Type assertions**: Use `as` to cast values (not recommended - hides issues)
2. **Union type variables**: Explicitly type variables as unions
3. **Runtime logic only**: Test actual behavior without type-level assertions

## Rationale
TypeScript's control flow analysis narrows literal types in branches, causing comparison errors when types can't overlap. In tests that verify logic paths:

```typescript
// This causes TS2367 error:
const viewMode: "calendar" = "calendar";
const showSearchBar = viewMode === "board"; // Error: types don't overlap

// This works:
const viewMode = "calendar"; // inferred as string
const showSearchBar = viewMode === "board"; // no error
```

For unit tests focusing on runtime behavior rather than type safety, avoiding explicit type annotations prevents these false-positive errors while still testing the intended logic.

## Context
When writing tests for components with union type states (like view modes), focus on testing the actual behavior rather than type-level guarantees. The TypeScript compiler already ensures type safety in the implementation.