---
title: Explicit Return Types Required
type: learning
source: M001/S03
tags: [typescript, conventions, exports]
---

## Problem
Multiple exported functions in card.service.ts missing explicit return types, violating project conventions.

## Root Cause
TypeScript can infer return types, but project requires ALL exported functions to have explicit types.

## Fix
Always add explicit return types to exported functions:
```typescript
// BAD
export async function createCard(db: Database, params: CreateCardParams) { ... }

// GOOD
export async function createCard(db: Database, params: CreateCardParams): Promise<Card> { ... }
```