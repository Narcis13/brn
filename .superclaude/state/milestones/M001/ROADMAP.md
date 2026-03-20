---
milestone: M001
status: planned
---

## Slices

### S01: User Authentication System ✓
**Demo:** After this, the user can sign up with email/password and log in to receive a JWT token
**Depends on:** none
**Risk:** medium
**Produces:** 
- Auth API endpoints (/signup, /login, /me)
- JWT token generation and validation
- User table schema and repository
- Password hashing utilities
- Auth middleware for protected routes
**Consumes:** none

### S02: Board Management ✓
**Demo:** After this, the user can create, view, and list their own boards
**Depends on:** S01
**Risk:** low
**Produces:**
- Board API endpoints (/boards GET/POST, /boards/:id GET/PATCH/DELETE)
- Board table schema with user ownership
- Board repository and service layer with validation
**Consumes:**
- JWT auth middleware from S01
- User ID from auth context

### S03: Card Operations ✓
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

## Reassessment (2026-03-19)

The roadmap remains solid. S01's implementation provides a strong foundation with auth middleware that subsequent slices can leverage. The only update needed was marking S01 as complete (✓) and documenting the additional deliverables that were built.

The slice ordering and dependencies still make perfect sense:
- S02-S03 build the backend functionality
- S04-S06 build the frontend, consuming the APIs
- Each slice has appropriate risk assessments and clear demo outcomes

No further changes to roadmap needed.

## Reassessment (2026-03-20)

With S02 now complete, the roadmap continues to prove well-structured:
- S02 delivered all planned board management features plus individual board operations
- The dependency chain remains valid - S03 can now consume board validation from S02
- Risk assessments remain accurate
- The backend-first (S01-S03) then frontend (S04-S06) approach is working well

No structural changes needed. Marked S02 as complete (✓) and updated its deliverables to reflect the additional endpoints built.



## Reassessment (2026-03-20)

With S03 now complete, the backend API is fully implemented:
- S03 delivered comprehensive card operations with CRUD, column movement, and position management
- All three backend slices (S01-S03) are now complete, providing a solid API foundation
- The frontend slices (S04-S06) can now proceed with all required backend functionality in place
- Dependencies and risk assessments remain accurate

The roadmap structure continues to prove effective. No changes needed beyond marking S03 as complete.



## Reassessment (2026-03-20)

Roadmap updated with S03 marked complete and reassessment added.

