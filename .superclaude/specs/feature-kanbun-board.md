---
title: KanBun Board — Personal Kanban Task Manager
status: ready
priority: high
milestone: M001
---

## What
A personal Kanban board application where users can sign up, log in, create boards with three columns (Todo, In Progress, Done), add cards to columns, and move cards between columns. The entire application runs on Bun with a React frontend served from the same process.

## Why
Test application to validate SUPER_CLAUDE autonomous coding. Exercises auth, CRUD, and UI in three vertical slices with clear boundaries.

## User Stories
- As a new user, I want to sign up with email and password so I can start managing tasks
- As a returning user, I want to log in so I can access my boards
- As a user, I want to create a board so I can organize my tasks
- As a user, I want to add cards to columns so I can track work items
- As a user, I want to move cards between columns so I can track progress

## Requirements
- Users can sign up with email + password (hashed, never stored plain)
- Users can log in and receive a JWT token
- JWT tokens expire after 24 hours
- All board/card endpoints require authentication
- Each board has three fixed columns: Todo, In Progress, Done
- Cards have a title (required) and description (optional)
- Cards can be moved between any columns
- Cards have a position (order) within their column
- Users can only see/edit their own boards and cards
- The React UI renders in the browser at http://localhost:3000
- All code lives under playground/src/

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite (file-based, playground/data.db)
- Auth: jose (JWT), Bun's built-in crypto for password hashing
- Frontend: React + ReactDOM
- CSS: Plain CSS (no framework)
- Build: Bun bundler

## Edge Cases
- Concurrent card moves (last-write-wins is acceptable for MVP)
- Very long card titles (truncate at 200 chars)
- Empty boards (show encouraging empty state)
- Token expiration during active session (redirect to login)

## Out of Scope
- Real-time collaboration / websockets
- Card attachments or images
- Board sharing between users
- Drag-and-drop (use button-based movement)
- Card due dates or labels
- Email verification
- Password reset
- Mobile-specific UI

## Open Questions
- None — this spec is fully defined for autonomous execution
