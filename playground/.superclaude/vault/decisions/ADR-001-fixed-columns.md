---
title: ADR-001 - Fixed Columns vs Dynamic Lists
type: decision
source: M001/S03
created: 2026-03-20
tags: [architecture, database, kanban]
---

## Status
Accepted

## Context
Kanban boards need columns to organize cards. We had to decide between:
1. Fixed columns as string literals
2. Dynamic columns as separate database entities

## Decision
Use fixed columns as TypeScript string literals: `"todo" | "doing" | "done"`

## Consequences
**Positive:**
- Simpler data model (no columns table)
- Type-safe column values
- Easier position management
- Clear business domain (3-column Kanban)

**Negative:**
- Cannot add custom columns
- Column names hardcoded
- Future flexibility limited

## Alternatives Considered
- **Separate columns table**: Rejected due to complexity for MVP
- **JSON column config**: Rejected, loses type safety
- **Enum in database**: Considered, but string literals simpler