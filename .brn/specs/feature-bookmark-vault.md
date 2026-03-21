---
title: Bookmark Vault — Personal Link Saver
status: ready
priority: high
---

## What
A minimal personal bookmark manager. Users paste a URL, it gets saved with an auto-extracted title, and they can tag, search, and delete bookmarks. Single-user (no auth), served from one Bun process.

## Why
Small enough to complete in ~10 /next runs. Exercises: HTTP API, SQLite persistence, React UI with forms and lists, search functionality. Good test of the BRN autonomous loop.

## User Stories
- As a user, I want to save a URL so I can find it later
- As a user, I want to see all my bookmarks in a list sorted by newest first
- As a user, I want to search my bookmarks by title or URL
- As a user, I want to tag bookmarks so I can organize them
- As a user, I want to filter bookmarks by tag
- As a user, I want to delete bookmarks I no longer need

## Requirements
- Single-page app at http://localhost:3000
- POST /api/bookmarks — save a new bookmark (body: `{ url, tags? }`)
  - Server fetches the URL's `<title>` tag automatically
  - If fetch fails, use the URL as the title
  - Tags are optional, comma-separated strings
- GET /api/bookmarks — list all bookmarks (newest first)
  - Supports `?q=` query param for searching title/URL
  - Supports `?tag=` query param for filtering by tag
- DELETE /api/bookmarks/:id — delete a bookmark
- SQLite database at `playground/data/bookmarks.db`
- Bookmarks table: id (TEXT PK), url (TEXT UNIQUE NOT NULL), title (TEXT), tags (TEXT as JSON array), created_at (TEXT)
- All code lives under `playground/`
- The UI must look clean and intentional — not raw unstyled HTML

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite
- Frontend: React + ReactDOM
- Build: bun build (bundle to playground/public/dist/)
- Styling: CSS file (not inline styles)

## UI Requirements
- Input field for URL with "Save" button at the top
- Tag input (comma-separated) next to URL input
- Search bar that filters in real-time
- Tag pills shown on each bookmark, clickable to filter
- Each bookmark shows: title (linked to URL), tags, date, delete button
- Empty state when no bookmarks
- Loading spinner during save/fetch
- Error messages for invalid URLs or failed saves
- Responsive: looks good on both desktop and mobile widths

## Edge Cases
- Duplicate URLs: reject with clear error message
- Invalid URLs (no protocol): prepend https:// automatically
- Very long titles: truncate display at 100 chars
- URL fetch timeout: 5 second max, fall back to URL as title
- Empty search results: show "No bookmarks match" message

## Out of Scope
- Authentication / multi-user
- Bookmark editing (only create + delete)
- Favicon fetching
- Import/export
- Folder hierarchy
- Drag-and-drop reordering
