---
title: Database Index Patterns
type: pattern
created: 2026-03-20
updated_by: evolver
tags: [patterns, database, performance]
related: [[patterns/typescript]]
---

## Summary
Essential database indexes for query performance, discovered through S03 performance review.

## Pattern

### Foreign Key Indexes
Always index foreign key columns used in WHERE clauses:

```sql
CREATE INDEX idx_cards_board_id ON cards(board_id);
```

### Composite Indexes for Common Queries
Index multiple columns together when frequently queried together:

```sql
CREATE INDEX idx_cards_board_column ON cards(board_id, column);
```

### Naming Convention
Use `idx_<table>_<columns>` format:
- `idx_cards_board_id`
- `idx_cards_board_column`
- `idx_users_email`

## When to Create Indexes
1. Foreign keys used in JOINs or WHERE
2. Columns frequently used in WHERE clauses
3. Columns used for sorting (ORDER BY)
4. Composite for multi-column queries

## Anti-Patterns
- Indexing every column (wastes space, slows writes)
- Missing indexes on foreign keys (N+1 queries)
- Not considering composite indexes for common query patterns