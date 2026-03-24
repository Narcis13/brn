---
title: Escape SQLite LIKE input with ESCAPE '\\' for card search
type: pattern
confidence: verified
source: run-004
feature: rich-cards
created: 2026-03-23
---

## Approach
When user-entered search text is used in SQLite `LIKE` predicates, escape backslashes, percent signs, and underscores first, then declare `ESCAPE '\\'` in the SQL.

## Example
```typescript
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

const searchPattern = `%${escapeLikePattern(query)}%`;
sql += " AND (LOWER(c.title) LIKE LOWER(?) ESCAPE '\\' OR LOWER(c.description) LIKE LOWER(?) ESCAPE '\\')";
```

## Why
SQLite does not treat backslash as an escape character unless `ESCAPE` is declared. Without both pieces, `%` and `_` in card searches behave like wildcards and return false positives.
