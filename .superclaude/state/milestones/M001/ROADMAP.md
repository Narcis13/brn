---
milestone: M001
status: planned
---

## Slices

### S01: User Authentication System
**Demo:** After this, the user can sign up with email/password and log in to receive a JWT token
**Depends on:** none
**Risk:** medium
**Produces:** 
- Auth API endpoints (/signup, /login)
- JWT token generation and validation
- User table schema and repository
- Password hashing utilities
**Consumes:** none

### S02: Board Management
**Demo:** After this, the user can create, view, and list their own boards
**Depends on:** S01
**Risk:** low
**Produces:**
- Board API endpoints (/boards GET/POST)
- Board table schema with user ownership
- Board repository and service layer
**Consumes:**
- JWT auth middleware from S01
- User ID from auth context

### S03: Card Operations
**Demo:** After this, the user can create cards in any column, edit them, and move them between columns
**Depends on:** S01, S02
**Risk:** medium
**Produces:**
- Card API endpoints (CRUD + move)
- Card table schema with position tracking
- Card repository with ordering logic
**Consumes:**
- JWT auth middleware from S01
- Board ID validation from S02

### S04: React Frontend Shell
**Demo:** After this, the user can access a React app at localhost:3000 with routing and auth state
**Depends on:** S01
**Risk:** low
**Produces:**
- React app setup with routing
- Auth context and protected routes
- Login/Signup forms
- Static file serving from Hono
**Consumes:**
- Auth API endpoints from S01

### S05: Board UI Components
**Demo:** After this, the user can view their boards in a list and create new boards through the UI
**Depends on:** S02, S04
**Risk:** low
**Produces:**
- Board list component
- Board creation form
- API client hooks for boards
**Consumes:**
- Board API from S02
- Auth context from S04

### S06: Kanban Board Interface
**Demo:** After this, the user can see a three-column Kanban board, add cards, and drag them between columns
**Depends on:** S03, S04, S05
**Risk:** high
**Produces:**
- Kanban board component with three columns
- Card components with drag-and-drop
- Real-time position updates
**Consumes:**
- Card API from S03
- Board context from S05
- Auth context from S04