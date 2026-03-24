# Run 10: Week View Drag-to-Reschedule (AC11)

## Summary
Implemented drag-to-reschedule for calendar week view with distinct behaviors: vertical dragging changes only the time, horizontal dragging changes only the date. Enhanced the drag system to support dropping cards on all-day row to remove time components.

## What I Did

### 1. Test-First Development
Created CalendarView.weekdrag.test.tsx with 9 comprehensive tests covering:
- Drag direction detection (vertical vs horizontal vs diagonal)
- Time-only updates for vertical drag
- Date-only updates for horizontal drag
- Multi-day card behavior maintaining date spans
- Drop target validation and constraints
- Time slot boundary checks

### 2. Enhanced Drag State Management
Modified the dragCard ref from storing just `{cardId, originalDate}` to `{card, originalDate}`:
- Enables access to full card data including start_date
- Supports multi-day card calculations
- Simplifies the drop handler logic

### 3. Rewrote handleSlotDrop with Direction Detection
The core logic now detects drag direction and updates accordingly:
```typescript
if (originalDateOnly === dateString && originalTime && originalTime !== formattedTime) {
  // Vertical drag - update only the time
  updates.due_date = `${dateString}T${formattedTime}`;
} else if (originalDateOnly !== dateString) {
  // Horizontal drag - update the date, preserve the time
  if (originalTime) {
    updates.due_date = `${dateString}T${originalTime}`;
  } else {
    updates.due_date = `${dateString}T${formattedTime}`;
  }
  // Handle multi-day cards...
}
```

### 4. Added All-Day Row Drop Support
Implemented complete drop handling for all-day cells:
- handleAllDayClick - for quick create
- handleAllDayDragOver/Leave - for visual feedback
- handleAllDayDrop - removes time component from dropped cards

### 5. Visual Feedback
Added CSS style for all-day drop targets matching the existing slot style:
```css
.calendar-week-allday-drop-active {
  background: rgba(12, 102, 228, 0.12) !important;
  box-shadow: inset 0 0 0 2px #0c66e4;
}
```

## Technical Insights

### Direction Detection Algorithm
The key innovation was detecting user intent from drag coordinates:
- Same date + different time = vertical drag (time change)
- Different date = horizontal drag (date change)
- This matches user expectations from calendar applications

### Multi-Day Card Consistency
When dragging multi-day cards horizontally:
1. Calculate day difference between original and target dates
2. Apply same offset to both start_date and due_date
3. Preserve any time components on both dates

### Edge Cases Handled
- Dragging from timed slot to all-day row removes time
- Dragging from all-day to timed slot adds time
- Multi-day cards spanning weeks work correctly
- Time boundaries (7:00-22:00) are respected

## Verification
- All 197 tests pass
- TypeScript compilation succeeds with no errors
- Manual testing confirms smooth drag behavior

## Acceptance Criteria Met
- ✅ AC11: Drag-to-reschedule on week view: vertical drag changes time, horizontal drag changes day

## Patterns for Vault
1. Week view drag direction detection based on date comparison
2. Preserving time components during date-only updates
3. Using full object refs in drag state for complex drag scenarios

## Next Steps
AC12 is next: Adding optional time picker to CardModal date inputs. This will complete the time management features by allowing users to add/edit/remove times directly in the card detail view.