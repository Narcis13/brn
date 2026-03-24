# Run 10: Drag-to-Reschedule on Month View (AC10)

## Summary
Implemented drag-to-reschedule functionality for calendar month view, ensuring multi-day cards maintain their duration when dragged by shifting both start and due dates by the same delta.

## What I Did

### 1. Enhanced the handleCellDrop function in CalendarView.tsx
- Added logic to calculate date difference between original and target dates
- For single-day cards (only due_date), updated just the due date
- For multi-day cards (both start_date and due_date), shifted both dates by the same delta
- Preserved time components during the shift operation

### 2. Fixed API parameter naming
- Changed from camelCase (dueDate, startDate) to snake_case (due_date, start_date)
- Fixed both month view and week view drop handlers
- Fixed quick create function parameter

### 3. Added comprehensive drag logic tests
- Extended CalendarView.dragdrop.test.tsx with multi-day card calculations
- Added tests for date shift calculations
- Added tests for preserving time components
- Fixed TypeScript type errors in test file

### 4. Verified implementation
- All tests pass (188 tests)
- TypeScript compilation successful
- Drag functionality correctly:
  - Updates only due_date for single-day cards
  - Updates both dates for multi-day cards
  - Preserves the duration (delta between dates)
  - Preserves time components if present

## Technical Details

The key implementation was calculating the day difference and applying it to both dates:

```typescript
const daysDiff = Math.round((targetDateObj.getTime() - originalDateObj.getTime()) / (1000 * 60 * 60 * 24));

// For multi-day cards, update both dates
if (card.start_date && card.due_date) {
  const startTime = getTimeFromDate(card.start_date);
  const newStartDate = new Date(card.start_date.split("T")[0] || "");
  newStartDate.setDate(newStartDate.getDate() + daysDiff);
  const newStartDateStr = newStartDate.toISOString().split("T")[0];
  updates.start_date = startTime ? `${newStartDateStr}T${startTime}` : newStartDateStr;
}
```

## Acceptance Criteria Met
- ✅ AC10: Drag-to-reschedule on month view: updates due_date (preserving time); multi-day cards shift both dates by same delta

## Next Steps
The next focus is AC11: implementing drag-to-reschedule for the week view, where vertical dragging changes time and horizontal dragging changes the day.