---
title: Explicit Return Types Required
type: learning
source: M001/S03
created: 2026-03-20
tags: [typescript, types, conventions]
---

## The Problem
Multiple exported functions missing explicit return type annotations, violating TypeScript conventions.

## Root Cause
TypeScript infers return types, but coding conventions require explicit types for all exported functions.

## Solution
Always add explicit return types to exported functions:
```typescript
// BAD
export async function createCard(db: Database, card: NewCard) { ... }

// GOOD
export async function createCard(db: Database, card: NewCard): Promise<Card> { ... }
```

## Action Items
- Add return types immediately when declaring functions
- Configure TSConfig/linter to enforce this rule
- Check all exports during implementation phase