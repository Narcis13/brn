---
title: Property Name Case Mismatch
type: learning
source: M001/S04
tags: [typescript, database, naming-conventions]
---

## Problem
TypeScript interfaces used camelCase (createdAt) but code accessed snake_case properties (created_at).

## Root Cause
Database returns snake_case column names, but frontend types expect camelCase for JavaScript conventions.

## Fix
Either transform data at API boundary or use consistent naming throughout. Frontend typically uses camelCase.

## Example
```typescript
// Interface expects:
interface Board { createdAt: Date; }

// But code was accessing:
board.created_at // TypeScript error!
```