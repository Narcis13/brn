---
title: Fixed Columns vs Dynamic Lists
type: decision
source: M001/S03
tags: [architecture, database, kanban]
---

## Context
Kanban boards need columns to organize cards. Should columns be fixed strings or a separate entity?

## Decision
Use fixed columns as string literals: 'todo' | 'doing' | 'done'

## Alternatives Considered
1. **Separate columns table** - More flexible but adds complexity
2. **JSON column in boards** - Allows customization but harder to query
3. **Fixed enum** - Simple and sufficient for MVP

## Rationale
- MVP scope only needs standard Kanban columns
- Simplifies queries and position tracking
- Can migrate to dynamic later if needed
- Reduces joins and complexity