# Calendar Multi-Day Card Filtering Decision

## Choice
Filter cards for each calendar cell by checking both single-day (due_date matches) and multi-day spans (card spans across the cell date).

## Alternatives Considered
1. Only show cards on their due_date
2. Show cards only on start_date
3. Duplicate card object for each spanned day

## Rationale
- Shows cards on all relevant days without duplication
- Simple date string comparison works with ISO format
- Handles both date-only and datetime values consistently
- Matches user expectation of seeing multi-day tasks across their duration

## Implementation
```typescript
cell.cards = cards.filter(card => {
  // Single day match
  if (card.due_date && card.due_date.startsWith(cell.dateString)) {
    return true;
  }
  // Multi-day span
  if (card.start_date && card.due_date) {
    const startDate = card.start_date.split("T")[0];
    const dueDate = card.due_date.split("T")[0];
    return cell.dateString >= startDate && cell.dateString <= dueDate;
  }
  return false;
});
```

## Confidence: verified