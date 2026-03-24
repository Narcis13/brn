---
title: Rich Cards & Real Workflow — Transform cards from title-only stubs into full productivity objects with labels, due dates, checklists, descriptions, activity tracking, search, and column reordering
status: done
priority: high
---

## What
Upgrade the kanban card from a simple title string into a rich productivity object with descriptions, colored labels, due/start dates, checklists, and an activity log. Add board-level search and filtering, column drag-reordering, and the temporal data model that enables a future calendar view.

## Why
The current app is a working kanban demo but not a tool anyone would use for real work. Cards with only a title can't capture context, deadlines, or progress. Without labels and filtering, boards become unwieldy past ~20 cards. Without dates, there's no time dimension — you can't answer "what's overdue?" or plan a week. This feature bridges the gap between "mini trello" and "almost trello."

## User Stories
- As a user, I want to click a card and see a detail panel where I can add a description, set dates, manage a checklist, and apply labels — so each card captures the full context of a task
- As a user, I want to create colored labels on my board and apply them to cards — so I can visually categorize work (e.g., "bug", "feature", "urgent")
- As a user, I want to set a start date and due date on a card — so I can track deadlines and enable future calendar views
- As a user, I want to add checklist items to a card and check them off — so I can break tasks into subtasks and track progress
- As a user, I want to see visual indicators on the board: label colors, due date badges (overdue/due-soon), and checklist progress bars — so I can scan the board and know the state of everything at a glance
- As a user, I want to search cards by title or description and filter by label or due date status — so I can find things quickly on a busy board
- As a user, I want to drag columns to reorder them — so I can customize my workflow layout
- As a user, I want to see an activity log on each card showing when it was created, moved, edited, or had checklist items completed — so I have a history of what happened

## Requirements

### Data Model

#### Labels table
- `id` TEXT PRIMARY KEY (nanoid)
- `board_id` TEXT NOT NULL (FK → boards, CASCADE DELETE)
- `name` TEXT NOT NULL (max 30 chars)
- `color` TEXT NOT NULL (hex color, e.g. "#e74c3c")
- `position` INTEGER NOT NULL (ordering within board)
- UNIQUE(board_id, name) — no duplicate label names per board

#### Card-Labels junction table
- `card_id` TEXT NOT NULL (FK → cards, CASCADE DELETE)
- `label_id` TEXT NOT NULL (FK → labels, CASCADE DELETE)
- PRIMARY KEY (card_id, label_id)

#### Cards table — new columns
- `description` TEXT DEFAULT '' (basic formatted text — bold, italic, links, lists)
- `due_date` TEXT DEFAULT NULL (ISO 8601 date string, e.g. "2026-04-15")
- `start_date` TEXT DEFAULT NULL (ISO 8601 date string)
- `checklist` TEXT DEFAULT '[]' (JSON array of `{id, text, checked}` objects)
- `created_at` TEXT NOT NULL (ISO 8601 timestamp — already exists or add if missing)
- `updated_at` TEXT NOT NULL (ISO 8601 timestamp — set on every edit)

#### Activity table
- `id` TEXT PRIMARY KEY (nanoid)
- `card_id` TEXT NOT NULL (FK → cards, CASCADE DELETE)
- `board_id` TEXT NOT NULL (FK → boards, CASCADE DELETE — for efficient board-level queries)
- `action` TEXT NOT NULL (enum: "created", "moved", "edited", "checklist_checked", "checklist_unchecked", "checklist_added", "checklist_removed", "label_added", "label_removed", "dates_changed")
- `detail` TEXT DEFAULT NULL (JSON — action-specific context, e.g. `{"from": "To Do", "to": "Done"}` for moves)
- `timestamp` TEXT NOT NULL (ISO 8601)

### API Endpoints

All endpoints scoped under `/api/boards/:boardId/` and protected by auth middleware + board ownership check.

#### Labels
- `GET /api/boards/:boardId/labels` — list all labels for the board, ordered by position
- `POST /api/boards/:boardId/labels` — create label `{name, color}`, auto-assign next position. 400 if name duplicate. Response: the created label.
- `PATCH /api/boards/:boardId/labels/:labelId` — update `{name?, color?, position?}`. 400 on duplicate name.
- `DELETE /api/boards/:boardId/labels/:labelId` — delete label, cascade removes from all cards

#### Card-Label assignments
- `POST /api/boards/:boardId/cards/:cardId/labels` — assign label `{labelId}`. 409 if already assigned. 404 if label not on this board.
- `DELETE /api/boards/:boardId/cards/:cardId/labels/:labelId` — remove label from card

#### Cards — enhanced
- `PATCH /api/boards/:boardId/cards/:cardId` — now accepts `{title?, description?, due_date?, start_date?, checklist?, column_id?}`. When `column_id` changes, this is a "move" — create activity entry. When other fields change, create "edited" activity. Validate: `start_date` must be ≤ `due_date` if both set.
- `GET /api/boards/:boardId/cards/:cardId` — full card detail including labels array, activity log (last 50 entries), and computed fields: `checklist_total`, `checklist_done`
- Existing card endpoints (create, delete, list via columns) continue to work — enhance responses to include labels and date fields

#### Activity
- `GET /api/boards/:boardId/cards/:cardId/activity` — list activity for a card, newest first, paginated (limit 50, offset param)
- Activity is created server-side only — no direct POST endpoint. The server generates activity entries when cards are modified.

#### Search & Filter
- `GET /api/boards/:boardId/search?q=<text>&label=<labelId>&due=<overdue|today|week|none>` — search cards by title/description text match (case-insensitive LIKE), filter by label, filter by due date status. Returns flat array of matching cards with their column info and labels.

#### Columns — reorder
- `PATCH /api/boards/:boardId/columns/reorder` — accepts `{column_ids: [...]}` in desired order. Reassigns position values. 400 if array doesn't match existing columns.

### UI Requirements

#### Card Detail Modal
- Opens when clicking any card on the board
- Full-width modal (max 700px) with overlay backdrop
- Sections stacked vertically:
  - **Title** — editable inline (click to edit, blur/enter to save)
  - **Labels** — horizontal row of colored pills, click "+" to open label picker
  - **Dates** — start date and due date with native `<input type="date">`, clear button for each
  - **Description** — textarea with basic formatting toolbar (bold, italic, link, bullet list). Renders formatted text when not editing. Click to enter edit mode.
  - **Checklist** — list of items with checkboxes, text input to add new item, delete button per item, progress bar at top showing X/Y complete
  - **Activity Log** — scrollable list at bottom, newest first, showing action + timestamp. Gray text, compact.
- Close via X button, Escape key, or clicking backdrop
- All changes save immediately on blur/change (optimistic UI, no "save" button)

#### Board View Enhancements
- **Card face** shows: title, label color dots (small circles), due date badge (if set), checklist progress (if has items: "2/5" with mini progress bar)
- **Due date badge colors**: overdue = red background, due today = orange, due within 3 days = yellow, future = gray, no date = hidden
- **Column drag** — columns can be dragged left/right to reorder. Use HTML5 drag-and-drop (same pattern as card drag but on column headers).
- **Search bar** — above the columns, full-width input. Filters cards in real-time as you type (client-side filter for speed, debounced API call for text search in descriptions). When search is active, non-matching cards are hidden (not removed from DOM — just display:none).
- **Filter bar** — below search, horizontal row of label pills. Click to toggle filter. Active filters highlighted. "Clear filters" link when any active.

#### Label Picker (in Card Detail)
- Dropdown showing all board labels with color swatch + name
- "Create new label" row at bottom with color picker (preset palette of 10 colors) and name input
- Click existing label to toggle assignment
- Checkmark on currently-assigned labels

#### States
- **Empty checklist**: "Add an item..." placeholder
- **No labels on board**: "Create your first label" prompt in label picker
- **No activity yet**: "No activity recorded" (only shows for freshly created cards)
- **Search with no results**: "No cards match your search" message centered in board area
- **Loading states**: cards show skeleton pulse while saving (brief — optimistic UI means this is rarely visible)

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono (existing)
- Database: bun:sqlite (existing — add new tables and columns via migration)
- Frontend: React 19 (existing)
- Build: bun build (existing)
- Styling: CSS file (extend existing `styles.css`)
- ID generation: nanoid (existing)
- Date handling: native Date API (no library needed for ISO string comparisons)
- Text formatting: Simple regex-based renderer (bold=`**text**`, italic=`*text*`, links=`[text](url)`, lists=`- item`) — no heavy markdown library

## Edge Cases
- **Deleting a label**: removes from all cards that had it. Cards don't break — they just lose that label.
- **Moving a card to same column**: no-op, no activity entry created
- **Due date in past on card creation**: allowed — user might be logging historical work
- **Start date after due date**: rejected with 400 error and clear message
- **Checklist with 0 items**: progress bar hidden on card face. Checklist section shows "Add an item..."
- **Very long descriptions**: no hard limit in DB, but UI truncates display after 500 chars with "show more" toggle
- **Concurrent edits**: last-write-wins (no real-time sync in this feature — that's future)
- **Column reorder with cards in columns**: positions update, cards stay in their columns
- **Search with special characters**: escape SQL LIKE wildcards (%, _) in search queries
- **Activity log growth**: no automatic pruning — cards rarely accumulate >100 events. Pagination handles display.
- **Migration**: existing cards get `description=''`, `due_date=null`, `start_date=null`, `checklist='[]'`, `created_at=now`, `updated_at=now`. Non-destructive — no data loss.

## Out of Scope
- **Comments / social features** — separate future feature
- **File attachments** — requires file storage, separate feature
- **Real-time collaboration / WebSocket sync** — separate feature
- **Calendar view** — this feature adds the temporal data model (start_date, due_date) that enables it, but the calendar UI itself is a separate feature
- **Card templates** — future enhancement
- **Board templates** — future enhancement
- **Recurring cards / due date recurrence** — future enhancement
- **Email/push notifications for due dates** — future enhancement
- **Markdown code blocks, tables, or images in descriptions** — only basic formatting (bold, italic, links, lists)
- **Undo/redo** — future enhancement
- **Bulk operations** (move multiple cards, bulk label assignment) — future enhancement
- **Card archiving** (soft delete) — future enhancement; for now, delete is permanent
