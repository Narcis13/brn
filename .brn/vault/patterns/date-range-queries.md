# Date Range Queries in SQLite

**Approach**: Use compound OR conditions to handle overlapping date ranges with optional datetime values

**Example**:
```sql
WHERE (
  -- Due date in range
  (c.due_date IS NOT NULL AND c.due_date >= ? AND c.due_date <= ?)
  OR
  -- Start date in range
  (c.start_date IS NOT NULL AND c.start_date >= ? AND c.start_date <= ?)
  OR
  -- Spans the range
  (c.start_date IS NOT NULL AND c.due_date IS NOT NULL 
   AND c.start_date <= ? AND c.due_date >= ?)
)
```

**When to use**:
- Calendar views that need to show all items overlapping a date range
- Supporting both date-only (YYYY-MM-DD) and datetime (YYYY-MM-DDTHH:MM) formats
- Handling cards with partial dates (only start or only due)

**Key insights**:
- Lexicographic string comparison works correctly for ISO 8601 dates
- Three overlap cases must be checked: due in range, start in range, spans range
- NULL checks prevent invalid comparisons
- Parameter binding order matters - repeat parameters for each condition

**Confidence**: verified