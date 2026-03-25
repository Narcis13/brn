# Run 005: Multi-day Bars Implementation (AC6)

## Context
After completing the basic calendar month view in run-004, the calendar could display cards on their due dates but lacked visual representation for cards spanning multiple days. AC6 required implementing horizontal bars for cards with both start_date and due_date spanning different days, positioned above single-day cards.

## Approach
I chose a layered rendering approach using CSS Grid and absolute positioning:
1. Calculate which cards are multi-day (have different start and due dates)
2. Implement a row allocation algorithm to prevent visual overlaps
3. Render multi-day bars as a separate layer above the calendar grid
4. Handle week-spanning cards by splitting them into per-week segments

Key design decisions:
- Use absolute positioning with grid-column spanning for clean layout
- Separate rendering pass for multi-day bars before regular cells
- Row allocation algorithm to stack overlapping date ranges

## What Was Built

### Files Modified
- `trello/src/ui/CalendarView.tsx` — Added multi-day card calculation, row allocation logic, and layered rendering
- `trello/public/styles.css` — Added styles for multi-day bars with proper positioning and visual hierarchy
- `trello/src/ui/CalendarView.test.tsx` — Added comprehensive tests for multi-day card detection and layout
- `trello/src/ui/BoardView.test.tsx` — Fixed unrelated TypeScript errors

### Key Implementation Details
1. **MultiDayCard Interface**: Tracks card, grid position (startIndex/endIndex), and row placement
2. **calculateMultiDayCards Function**: Core algorithm that:
   - Maps dates to grid indices
   - Allocates non-overlapping rows for each multi-day card
   - Returns positioned cards for rendering
3. **Layered Rendering**: Multi-day bars render before regular cells, using CSS Grid positioning
4. **Week Spanning**: Cards crossing week boundaries split into separate visual segments

## Key Decisions
- **Absolute positioning over inline**: Cleaner separation between multi-day and single-day cards
- **Row allocation algorithm**: Prevents visual collisions while minimizing vertical space
- **Split week-spanning bars**: Maintains grid structure while showing continuity

## Challenges & Solutions
The main challenge was handling cards that span across week boundaries in the calendar grid. The solution was to detect week transitions and render separate bar elements for each week, showing the title only on the first segment.

## Verification Results
- Tests: 17 passed (added 5 new tests for multi-day functionality)
- Types: Clean after fixing unrelated BoardView.test.tsx errors
- Build: Success

## Acceptance Criteria Progress
- AC6: MET — Multi-day bars implemented with proper positioning and title display
- Overall: 6/14 met

## Vault Entries Added
- `patterns/multi-day-card-layout.md`: Row allocation algorithm for overlap prevention
- `decisions/calendar-layered-rendering.md`: Why absolute positioning was chosen
- `codebase/calendar-week-spanning.md`: Insight about handling week boundaries

## What's Next
AC7 requires implementing the week view with time slots. This will involve:
- Creating a new week view component with 7-day columns
- Adding time grid with 30-minute slots from 07:00-22:00
- Separating all-day cards from timed cards
- Positioning timed cards based on their time components