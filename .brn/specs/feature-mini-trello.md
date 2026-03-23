---
title: Mini Trello — Single-Board Kanban
status: ready
priority: high
---

## What
A single-board kanban app with draggable cards organized into columns. Users can create, edit, and delete cards (with title and description), drag them between columns, and manage columns themselves. Single-user, no auth, served from one Bun process.

## Why
Right-sized feature to exercise the BRN autonomous loop: multi-entity data modeling (columns + cards with ordering), drag-and-drop interaction, modal UI, and CRUD across two related resources. ~5 units of work — meaty enough to be real, small enough to finish.

## User Stories
- As a user, I want to see my tasks organized in columns so I can visualize my workflow
- As a user, I want to add a card with a title and description so I can capture work items
- As a user, I want to edit a card's title and description so I can refine details
- As a user, I want to delete a card I no longer need
- As a user, I want to drag cards between columns so I can update their status
- As a user, I want to reorder cards within a column so I can prioritize
- As a user, I want to add, rename, and delete columns so I can customize my workflow

## Requirements
- Single-page app at http://localhost:3001
- Board auto-seeds 3 default columns on first load: "To Do", "In Progress", "Done"

### Column Endpoints
- GET /api/columns — list all columns ordered by `position`
  - Response: `{ columns: [{ id, title, position, cards: [{ id, title, description, position, columnId, createdAt }] }] }`
- POST /api/columns — create a column (body: `{ title }`)
  - Auto-assigns next position
  - Response: `{ id, title, position }`
- PATCH /api/columns/:id — update column (body: `{ title? }`)
- DELETE /api/columns/:id — delete column and all its cards

### Card Endpoints
- POST /api/cards — create a card (body: `{ title, description?, columnId }`)
  - Auto-assigns next position within the column
  - Response: `{ id, title, description, position, columnId, createdAt }`
- PATCH /api/cards/:id — update card (body: `{ title?, description?, columnId?, position? }`)
  - When columnId or position changes, reorder affected cards
- DELETE /api/cards/:id — delete a card and reorder remaining cards in its column

### Data Model (SQLite)
- **columns** table: `id` (TEXT PK, nanoid), `title` (TEXT NOT NULL), `position` (INTEGER NOT NULL)
- **cards** table: `id` (TEXT PK, nanoid), `title` (TEXT NOT NULL), `description` (TEXT DEFAULT ''), `position` (INTEGER NOT NULL), `column_id` (TEXT NOT NULL FK → columns.id ON DELETE CASCADE), `created_at` (TEXT DEFAULT CURRENT_TIMESTAMP)
- Database file: `trello/data/kanban.db`

### Drag-and-Drop
- Cards can be dragged between columns and reordered within a column
- Use HTML5 Drag and Drop API (no external library)
- On drop: PATCH the card's columnId and position, server reorders affected cards
- Visual feedback during drag: placeholder/ghost in target position

### UI
- Horizontal scrollable board with columns side-by-side
- Each column: header with title (editable on click) + "Add card" button at bottom
- Each card: shows title, truncated description preview, click to open edit modal
- Modal for add/edit: title input, description textarea, Save/Cancel buttons
- "Add column" button at the end of the board
- Delete column: icon button in column header with confirmation
- Delete card: button in the edit modal

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite
- Frontend: React + ReactDOM (via CDN or bun build)
- Build: bun build (bundle to trello/public/dist/)
- Styling: CSS file (trello/public/styles.css)
- All code lives under `trello/` at the project root

## UI Requirements
- Kanban board fills viewport width, columns scroll horizontally if they overflow
- Columns have a fixed width (~280px), cards fill the column width
- Cards have subtle shadow, rounded corners, white background on a light gray column
- Drag feedback: card becomes semi-transparent while dragging, drop zone highlighted
- Modal: centered overlay with backdrop, form fields, action buttons
- Empty column shows "No cards yet" message
- Column header: title text (click to edit inline) + delete icon
- Responsive: on narrow screens, columns stack vertically or scroll horizontally
- Color scheme: neutral grays and whites with a blue accent (Trello-like)

## Edge Cases
- Empty board (all columns deleted): show "Add a column to get started" message
- Duplicate column titles: allowed (no uniqueness constraint)
- Empty card title on submit: prevent save, show validation message
- Delete column with cards: cascade delete, no orphaned cards
- Rapid drag-and-drop: debounce or queue API calls to prevent race conditions
- Very long card titles: truncate in board view, full text in modal
- Very long descriptions: scrollable in modal, truncated preview on card (first 80 chars)

## Out of Scope
- Authentication / multi-user
- Multiple boards
- Card labels / colors / due dates
- Card comments or attachments
- Column reordering (drag columns) — cards only
- Undo/redo
- Real-time sync / WebSocket
- Search or filtering
