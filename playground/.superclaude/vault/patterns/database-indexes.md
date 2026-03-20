---
title: Database Index Pattern
type: pattern
created: 2026-03-20
tags: [database, performance, sqlite]
related: [[architecture/overview]]
---

## Summary
Essential indexes for common query patterns in the application.

## Pattern

### Foreign Key Indexes
Always index foreign key columns:
```sql
CREATE INDEX idx_cards_board_id ON cards(board_id);
```

### Compound Indexes for Filters
Index combinations used in WHERE clauses:
```sql
CREATE INDEX idx_cards_board_column ON cards(board_id, column_name);
```

### Position Queries
If querying by position within scope:
```sql
CREATE INDEX idx_cards_position ON cards(board_id, column_name, position);
```

## When to Use
- Any foreign key relationship
- Common query filters
- Sorting columns
- Large tables (>1000 rows)

## Anti-Patterns
- Over-indexing (every column)
- Missing foreign key indexes
- Indexes on low-cardinality columns
- Not monitoring query performance