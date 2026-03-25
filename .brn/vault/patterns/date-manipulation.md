# Date Manipulation Pattern

## Approach
When implementing date shifts (e.g., drag-to-reschedule), calculate the day difference once and apply it consistently to all related dates to maintain relationships.

## Example
```typescript
// Calculate day difference
const daysDiff = Math.round((targetDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));

// Apply to all related dates
if (card.due_date) {
  const dueTime = getTimeFromDate(card.due_date);
  const newDueDate = new Date(card.due_date.split("T")[0]);
  newDueDate.setDate(newDueDate.getDate() + daysDiff);
  const newDueDateStr = newDueDate.toISOString().split("T")[0];
  updates.due_date = dueTime ? `${newDueDateStr}T${dueTime}` : newDueDateStr;
}
```

## When to Use
- Drag-and-drop rescheduling
- Bulk date updates
- Maintaining duration/span for multi-date entities

## Confidence
verified