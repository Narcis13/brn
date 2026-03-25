---
title: Multi-day Card Layout Algorithm
type: pattern
confidence: verified
source: run-005
feature: calendar-view
created: 2026-03-24
---

## Approach
Calculate optimal row placement for multi-day cards to avoid visual overlaps using a row allocation algorithm. Track occupied cells per row and find the first available row that can accommodate the full span.

## Example
```typescript
function calculateMultiDayCards(cards: CalendarCard[], monthGrid: DateCell[]): MultiDayCard[] {
  const occupiedRows: Set<string>[] = [];
  
  cards.forEach(card => {
    if (isMultiDayCard(card)) {
      let row = 0;
      while (!canPlaceInRow(row, startIndex, endIndex)) {
        row++;
      }
      // Mark cells as occupied
      for (let i = startIndex; i <= endIndex; i++) {
        const key = `${Math.floor(i / 7)}-${i}`;
        occupiedRows[row].add(key);
      }
    }
  });
}
```

## When to Use
- Rendering overlapping date ranges in calendar grids
- Need to display multiple spans without visual collision
- Calendar views with multi-day events