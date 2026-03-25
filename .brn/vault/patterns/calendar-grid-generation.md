# Calendar Grid Generation Pattern

## Approach
Generate a 42-cell grid (6 weeks × 7 days) for consistent month view layout, starting on Monday.

## Example
```typescript
function getMonthGrid(year: number, month: number): DateCell[] {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  // Convert Sunday=0 to Monday=0 system
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  
  const cells: DateCell[] = [];
  const startDate = new Date(year, month, 1 - startOffset);
  
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    // Calculate cell properties...
    cells.push(cellData);
  }
  
  return cells;
}
```

## When to Use
- Building calendar month views with consistent 6-week layout
- Need to show previous/next month days for context
- Starting week on Monday (European convention)

## Confidence: verified