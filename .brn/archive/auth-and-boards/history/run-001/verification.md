# Verification — Run 001

## Tests
- Result: PASS
- Passed: 31, Failed: 0, Skipped: 0
- Notable: Full coverage of auth (register/login/me), middleware (401 enforcement), board CRUD, scoped column/card endpoints, cross-board isolation, cascade deletes

## Type Check
- Result: PASS
- Errors: 0

## Build
- Result: N/A (frontend not modified this run)

## Acceptance Criteria
| AC | Status | Notes |
|----|--------|-------|
| AC1 | MET | Users table with id, username (unique), password_hash, created_at |
| AC2 | MET | Boards table with FK to users; columns.board_id FK to boards; cascading deletes |
| AC3 | MET | POST /api/auth/register — username validation (3-30 chars, alphanum+underscore), password min 6, hashes with Bun.password, returns JWT + user, 409 on duplicate |
| AC4 | MET | POST /api/auth/login — validates credentials, returns JWT + user, 401 on invalid |
| AC5 | MET | GET /api/auth/me — returns current user from JWT, 401 if missing/invalid |
| AC6 | MET | Auth middleware protects all /api/* except register/login; Bearer token; 401 on invalid |
| AC7 | MET | GET /api/boards — lists authenticated user's boards ordered by created_at desc |
| AC8 | MET | POST /api/boards — creates board, seeds 3 default columns; DELETE cascades |
| AC9 | MET | Column/card endpoints scoped to /api/boards/:boardId/*; board ownership verified; old flat routes removed |
| AC10 | NOT YET | Login/Register UI — frontend not started |
| AC11 | NOT YET | Board list page — frontend not started |
| AC12 | NOT YET | Board view — frontend not started |
| AC13 | NOT YET | Token management — frontend not started |

## Overall: PASS
