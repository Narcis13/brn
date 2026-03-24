---
title: Calendar View — Time-aware card scheduling with month and week views, drag-to-reschedule, and quick-create
status: ready
priority: high
---

## What
Add a Calendar View as an alternative way to visualize a board's cards on a time-based grid. Includes a month view (date cells with multi-day bars for cards spanning start→due), a week view with 30-minute time slots, drag-to-reschedule on both views, and click-to-create cards directly from the calendar. Upgrade the existing date-only `due_date`/`start_date` fields to support optional hour:minute precision.

## Why
The board view is great for workflow stages but has no time dimension — you can't see what's due this week at a glance, plan your day, or visualize how tasks overlap in time. Every serious project tool (Trello Calendar Power-Up, Asana Calendar, ClickUp, Monday.com) offers a calendar view because users think about work in two frames: workflow state (board columns) and time (when is it due, how long does it take). The rich-cards feature already added `due_date` and `start_date` — this feature makes them visual and interactive. Adding optional time precision (hour:minute) enables scheduling at the day level, not just the date level.

## User Stories
- As a user, I want to toggle between Board and Calendar views on my board — so I can see the same cards organized by workflow stage or by time
- As a user, I want to see a monthly calendar grid with my cards placed on their due dates — so I can see deadlines at a glance and spot overloaded days
- As a user, I want cards with both start and due dates to appear as horizontal bars spanning those days — so I can see task duration and overlap
- As a user, I want a weekly view with 30-minute time slots — so I can schedule and see exactly when tasks happen during the day
- As a user, I want to drag a card from one date to another on the calendar — so I can quickly reschedule without opening the card detail
- As a user, I want to click an empty date cell or time slot and create a card with that date/time pre-filled — so I can plan directly from the calendar
- As a user, I want to set an optional time (hour:minute) on card dates — so I can schedule tasks at specific times, not just dates
- As a user, I want cards without a time to appear as "all-day" items in the week view — so date-only and timed cards coexist cleanly

## Requirements

### Data Model Changes

#### Cards table — date field upgrade
- `due_date` and `start_date` keep their TEXT type but now accept two formats:
  - Date-only: `"2026-04-15"` (existing format, treated as all-day)
  - Date+time: `"2026-04-15T14:30"` (new format, scheduled at specific time)
- No migration needed — existing date-only values remain valid
- Validation: if time is present, must be `HH:MM` in 24h format (00:00–23:59)
- The `start_date <= due_date` constraint now compares full datetime strings (lexicographic comparison works for ISO format)

### API Endpoints

#### Calendar data endpoint
- `GET /api/boards/:boardId/calendar?start=<ISO-date>&end=<ISO-date>` — returns all cards that overlap with the given date range
  - A card overlaps if: `due_date` falls within range, OR `start_date` falls within range, OR card spans the range (start before, due after)
  - Cards with no dates are excluded
  - Response shape: `{ cards: Array<{ id, title, due_date, start_date, column_id, column_title, labels: Array<{id, name, color}>, checklist_total, checklist_done }> }`
  - Query is inclusive on both ends: `start <= card_date <= end`
  - This endpoint exists for efficiency — loading a month of cards without fetching the entire board

#### Card date updates (existing endpoint, enhanced validation)
- `PATCH /api/boards/:boardId/cards/:cardId` — already handles `due_date` and `start_date`
- Add validation for the new datetime format: accept `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`
- Reject malformed time values (e.g., `T25:00`, `T14:60`, `T1:5`)
- The drag-to-reschedule UI calls this existing endpoint — no new endpoint needed

#### Quick-create from calendar (uses existing endpoint)
- `POST /api/boards/:boardId/cards` — already exists
- The calendar UI pre-fills `due_date` (with optional time from week view) and lets user pick a column
- No backend changes needed — just client-side UX

### UI Requirements

#### View Toggle
- Add "Board" | "Calendar" tab buttons at the top of the board view, above the search bar
- Default view is "Board" (existing behavior)
- Switching views preserves the board context — no page reload, no route change
- Active tab is visually highlighted
- The search/filter bar from the board view is hidden when in calendar view (calendar has its own navigation)

#### Month View
- Standard 7-column calendar grid (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Navigation bar: `< [Month Year] >` with previous/next month buttons and a "Today" button that jumps to current month
- Each date cell shows:
  - The day number (1-31), gray for days outside current month
  - Card chips: small colored bars showing card title (truncated to ~20 chars), colored by first label or neutral gray
  - Max 3 cards visible per cell, then a "+N more" link that expands or opens a popover
- Multi-day bars: cards with both `start_date` and `due_date` spanning multiple days render as a horizontal bar across date cells, showing the card title. Bars are positioned above single-day cards for visual layering.
- Today's date cell has a highlighted background or border
- Clicking a card chip opens the existing CardModal
- Clicking empty space in a date cell opens the quick-create popover
- Dragging a card chip to a different date cell updates the `due_date` (preserving any time component). If the card has both dates, the entire span shifts by the same delta.

#### Week View
- 7 columns (Mon–Sun) for the current week
- Navigation bar: `< [Week range: Mar 24 – Mar 30, 2026] >` with previous/next week and "Today" button
- **All-day row** at the top: cards with date-only values (no time) appear here as horizontal chips
- **Time grid** below: rows for each 30-minute slot from 07:00 to 22:00 (configurable range not needed for v1)
  - Time labels on the left axis: "7:00", "7:30", "8:00", etc.
  - Timed cards appear as blocks at their time position, height proportional to duration (if both start_time and due_time exist) or fixed 30-min height (if only due_date has time)
  - Cards with start_date+time and due_date+time span from start to end time (if same day) or show at start time (if multi-day)
- Clicking a card opens the CardModal
- Clicking an empty time slot opens quick-create popover with date + time pre-filled
- Dragging a card vertically moves it to a different time slot (updates time component of due_date)
- Dragging a card horizontally moves it to a different day (updates date component)

#### Quick-Create Popover
- Appears when clicking an empty calendar cell/slot
- Contains: title input (auto-focused), column dropdown (populated from board columns, defaults to first column), "Create" button
- Pre-fills `due_date` from the clicked cell (date from month view, date+time from week view)
- Enter key submits, Escape closes
- On creation, the card appears immediately on the calendar (optimistic UI)
- Compact design — positioned near the click point, not a full modal

#### Card Chips on Calendar
- Show: title (truncated), first label color as left border or dot, due-date badge color (overdue=red, today=orange, near=yellow — same logic as board view)
- On hover: show full title in a tooltip
- Draggable with HTML5 drag-and-drop (visual feedback: semi-transparent clone follows cursor, drop target cell highlights)

#### Date+Time Input Enhancement (Card Detail Modal)
- The existing date inputs in CardModal gain an optional time picker
- Below each `<input type="date">`, add a time toggle: "Add time" link that reveals an `<input type="time">` (HH:MM)
- If time is set, display shows "Apr 15, 2026 at 14:30". If not, just "Apr 15, 2026"
- "Remove time" link to clear the time component back to date-only
- Saves on blur/change (same as existing date behavior)

### States
- **No cards with dates**: calendar shows empty grid with message "No cards scheduled. Set due dates on cards or click a date to create one."
- **Loading**: skeleton pulse on calendar grid while fetching
- **Month cell overflow**: "+N more" clickable text when >3 cards on a date
- **Drag feedback**: source card dims, target cell highlights with a subtle border
- **Quick-create**: popover with loading state on submit button while API call completes
- **Today marker**: today's date always visually distinct (highlighted border/background)
- **Weekend columns**: slightly different background shade in both views for Sat/Sun

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono (existing)
- Database: bun:sqlite (existing — no new tables, enhanced validation only)
- Frontend: React 19 (existing)
- Build: bun build (existing)
- Styling: CSS file (extend existing `styles.css`)
- Date handling: native Date API (no external library — ISO string parsing and calendar grid math are straightforward)
- Drag-and-drop: HTML5 drag-and-drop API (same approach as existing card/column drag)
- All code lives under `trello/src/` (backend) and `trello/src/ui/` (frontend components)

## Edge Cases
- **Dragging a multi-day card**: shifts both start_date and due_date by the same offset (e.g., drag 2 days forward → both dates move 2 days)
- **Dragging to a past date**: allowed — user might be logging historical work
- **Card with start_date but no due_date**: shows on calendar at start_date only (single chip, no bar)
- **Card with due_date but no start_date**: shows as single chip on due_date
- **Card with neither date**: not shown on calendar (only visible in board view)
- **Month view: cards spanning across month boundary**: bar starts/ends at month edge with a visual indicator (clipped bar with arrow)
- **Week view: card at 22:00 (end of grid)**: positions at bottom of grid, doesn't overflow
- **Week view: card spanning midnight**: shows in all-day row instead of time grid (cross-day timed events are complex; keep it simple for v1)
- **Time format edge cases**: "00:00" is valid (midnight), "23:59" is valid, "24:00" is rejected
- **Quick-create with empty title**: create button disabled, same validation as board card creation
- **Timezone handling**: all times stored and displayed in local time (no timezone conversion in v1 — single-user app)
- **Existing cards with date-only values**: work seamlessly — they appear as all-day events in week view and normal chips in month view
- **Very busy day (10+ cards)**: month cell shows 3 + "+7 more" with popover/expandable list; week view scrolls naturally since cards stack
- **Narrow viewport**: calendar is not responsive for mobile in v1 — optimized for desktop width (>900px)

## Out of Scope
- **Recurring events / repeating due dates** — future enhancement
- **Multi-board calendar** (aggregate view across all boards) — separate feature
- **Timezone support / UTC conversion** — not needed for single-user local app
- **iCal export / Google Calendar sync** — future integration feature
- **Day view** — month + week covers the core use cases
- **Custom week start day** (e.g., start on Sunday vs Monday) — hardcoded to Monday for v1
- **Color-coding cards by column on calendar** — cards use label colors; column info shown on hover/click
- **Agenda/list view** (chronological list of upcoming cards) — future enhancement
- **Time duration input** (e.g., "this task takes 2 hours") — duration is implicit from start→due time
- **Resizing cards on calendar to change duration** — only drag-to-move, not resize
- **Mobile/responsive calendar layout** — desktop only for v1
