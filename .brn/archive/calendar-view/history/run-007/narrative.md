# Run 007: Quick-Create Popover for Calendar View (AC8)

## Context
The calendar view feature has been steadily progressing:
- AC1-AC3: Date/time validation and API endpoints ✓
- AC4: Board|Calendar toggle ✓ 
- AC5: Month view with navigation ✓
- AC6: Multi-day card bars ✓
- AC7: Week view with time slots ✓
- **AC8: Quick-create popover (this run)**

The task was to implement a quick-create popover that appears when clicking empty cells/slots on the calendar, allowing users to create cards directly from the calendar view with pre-filled dates/times.

## What Happened

### 1. Component Architecture
Created a new `QuickCreatePopover` component with:
- **Props interface**: show, position, columns, prefilledDate, onClose, onCreate
- **Auto-positioning**: Keeps popover within viewport boundaries
- **Click-outside handling**: Closes when clicking outside the popover
- **Escape key handling**: Closes on Escape key press
- **Auto-focus**: Title input gets focus when popover opens

### 2. Form Implementation
The popover contains a minimal form with:
- **Title input**: Required field, auto-focused, with placeholder
- **Column dropdown**: Pre-populated with board columns, defaults to first
- **Date display**: Shows the prefilled date/time in human-readable format
- **Create button**: Disabled when title is empty, shows loading state

### 3. Calendar Integration
Integrated the popover into CalendarView:
- **Month view**: Clicking empty space in a date cell opens popover with date
- **Week view**: Clicking empty time slot opens popover with date+time
- **Click detection**: Prevents popover when clicking on existing cards
- **State management**: Tracks show/hide state and position

### 4. API Enhancement
Extended the card creation flow:
- **Frontend**: Updated `api.createCard` to accept optional `due_date`
- **Backend route**: Modified POST `/api/boards/:boardId/cards` to accept and validate `due_date`
- **Database function**: Updated `createCard` in db.ts to store `due_date` on creation

### 5. Styling
Added comprehensive CSS for the popover:
- **Container**: White background, rounded corners, drop shadow, entrance animation
- **Form fields**: Consistent with existing modal styles
- **Date info**: Light blue background pill with calendar emoji
- **Responsive**: Position adjusts to stay within viewport

### 6. Testing Strategy
Wrote unit tests covering:
- Date formatting (date-only vs date+time)
- Position calculation (viewport boundaries)
- Title validation (trimming, empty check)
- Date prefilling scenarios

## Technical Decisions

### Why a Separate Component?
Created QuickCreatePopover as its own component rather than reusing CardModal because:
- **Minimal UI**: Quick-create needs only title and column, not full card editing
- **Different UX**: Popover positioning near click point vs centered modal
- **Performance**: Lighter weight component for frequent interactions

### Position Calculation
The popover uses fixed positioning with viewport boundary checks:
```typescript
const popoverStyle: React.CSSProperties = {
  position: "fixed",
  left: Math.min(position.x, window.innerWidth - 320),
  top: Math.min(position.y, window.innerHeight - 200),
  zIndex: 1000
};
```

### Date Handling
Leveraged JavaScript's native Date formatting:
- `toLocaleDateString` for date-only display
- `toLocaleString` for date+time display
- Consistent "en-US" locale for predictable formatting

### Backend Extension
Modified the card creation endpoint to optionally accept `due_date`:
- Validates format using existing `isValidDateFormat` helper
- Passes through to database layer
- No migration needed - just enhancing existing flow

## Challenges & Solutions

### Click Event Propagation
**Challenge**: Clicking on cards within cells was triggering the cell's onClick handler.
**Solution**: Check event target for card elements before showing popover:
```typescript
if ((e.target as HTMLElement).closest(".calendar-card-chip, .calendar-multiday-bar")) {
  return;
}
```

### Testing Without DOM
**Challenge**: Initial tests used `@testing-library/react` which wasn't available.
**Solution**: Rewrote tests using bun:test with pure logic tests instead of DOM interaction tests.

### API Signature Mismatch
**Challenge**: Frontend was sending `due_date` but backend wasn't accepting it.
**Solution**: Updated both the route handler and database function to accept the optional `due_date` parameter.

## What Worked Well
- Clean separation of concerns with the popover component
- Reusing existing styling patterns from modals
- Leveraging native Date formatting instead of a library
- Simple state management with a single state object

## Acceptance Criteria Status
✅ **AC8 Complete**: "Quick-create popover on empty cell/slot click: title input (auto-focused), column dropdown, pre-filled date/time, Enter submits, Escape closes, optimistic UI"

All requirements met:
- ✓ Popover appears on empty cell/slot click
- ✓ Title input with auto-focus
- ✓ Column dropdown populated from board columns  
- ✓ Pre-filled date (date-only for month view, date+time for week view)
- ✓ Enter key submits the form
- ✓ Escape key closes the popover
- ✓ Optimistic UI with immediate card appearance after creation

## Files Changed
- Created: `QuickCreatePopover.tsx` (component)
- Created: `QuickCreatePopover.test.tsx` (tests)
- Modified: `CalendarView.tsx` (integration)
- Modified: `BoardView.tsx` (pass columns prop)
- Modified: `api.ts` (add due_date param)
- Modified: `routes.ts` (accept due_date in POST)
- Modified: `db.ts` (store due_date on creation)
- Modified: `styles.css` (popover styles)

## Next Steps
With AC8 complete, the remaining acceptance criteria are:
- AC9: Card chip styling and drag feedback
- AC10: Drag-to-reschedule on month view
- AC11: Drag-to-reschedule on week view
- AC12: Date+time inputs in CardModal
- AC13: Empty states and polish
- AC14: Full navigation support

The calendar view is becoming increasingly interactive. The next logical step would be AC9 (card chip enhancements) as it provides the visual foundation for the drag-and-drop features in AC10-11.