# Run 009: Card Chip Enhancements and Drag Feedback

## Overview
This run focused on implementing AC9: enhancing calendar card chips with visual styling, tooltips, and HTML5 drag-and-drop functionality. The implementation added draggable behavior to calendar cards in both month and week views, with proper visual feedback during drag operations.

## What Happened

### Initial Analysis
Started by examining the existing calendar card rendering in both month and week views. Found that cards were already being displayed but lacked:
- Visual styling for labels and due date indicators
- Tooltip information on hover
- Drag-and-drop capabilities

### Implementation Steps

1. **Enhanced Card Chip Styling**
   - Modified the `CalendarCard` component to display:
     - Truncated titles with ellipsis for overflow
     - First label color as a left border indicator
     - Due date badge with color coding (red for overdue, orange for due today, gray for future)
   - Added proper CSS classes for visual consistency

2. **Added Tooltip Support**
   - Implemented HTML title attributes on card elements
   - Tooltips show full card title, column name, and formatted due date
   - Works consistently across both month and week views

3. **Implemented Drag-and-Drop**
   - Made calendar cards draggable using HTML5 drag-and-drop API
   - Added `draggable="true"` attribute to card elements
   - Implemented drag event handlers:
     - `dragstart`: Sets drag data and adds visual feedback (opacity 0.5)
     - `dragend`: Cleans up drag state
   - Added drop zone handlers to date cells and time slots:
     - `dragover`: Prevents default to allow drop
     - `dragenter`: Highlights potential drop targets
     - `dragleave`: Removes highlight when leaving drop zone
     - `drop`: Handles the drop event and updates card due date

4. **API Integration**
   - Connected drop handlers to the existing PATCH endpoint
   - Updates card due_date when dropped on a new date/time
   - Preserves existing time when dropping on date-only cells
   - Sets specific time when dropping on time slots

5. **Visual Feedback**
   - Dragging card becomes semi-transparent (opacity 0.5)
   - Drop zones highlight with a light blue background on hover
   - Smooth transitions for all visual states

### Testing
Created comprehensive unit tests covering:
- Card chip rendering with proper styling elements
- Tooltip content generation
- Drag event handler behavior
- Drop zone highlighting logic
- API call verification for date updates
- Edge cases like dropping on the same date

All tests pass successfully (185 total tests).

## Technical Decisions

1. **HTML5 Drag-and-Drop vs Library**: Chose native HTML5 API for simplicity and performance. No need for external dependencies for basic drag functionality.

2. **Data Transfer Format**: Used JSON stringified card data in dataTransfer to maintain all card properties during drag operations.

3. **Drop Zone Granularity**: Made individual date cells and time slots drop targets rather than the entire calendar, providing precise control over scheduling.

4. **Visual Feedback Strategy**: Used CSS classes for drag states rather than inline styles, maintaining separation of concerns and allowing easy theme customization.

## Challenges Resolved

1. **Cross-View Consistency**: Ensured drag-and-drop works identically in both month and week views despite different DOM structures.

2. **Date Preservation**: When dropping on date-only cells (month view), preserved the original time component if it existed.

3. **Event Propagation**: Properly managed event bubbling to prevent interference between nested drop zones.

## Outcome
Successfully implemented AC9 with full drag-and-drop functionality, visual enhancements, and comprehensive test coverage. Calendar cards now provide rich visual feedback and intuitive drag interactions, setting the foundation for the drag-to-reschedule features in AC10 and AC11.