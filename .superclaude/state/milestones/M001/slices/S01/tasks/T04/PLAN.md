---
task: T04
slice: S01
milestone: M001
status: pending
---

## Goal
Auth Middleware & Protected Routes

**Goal:** Create Hono middleware that verifies JWT tokens and extracts user context, establishing the contract consumed by S02, S03, and S04.

#### TDD Sequence
- Test file(s): `playground/src/auth/middleware.test.ts`
- Test cases:
  - Request with valid `Authorization: Bearer <token>` header passes through with `authContext` set
  - Request without `Authorization` header returns 401
  - Request with malformed `Authorization` header returns 401
  - Request with expired token returns 401
  - Request with invalid token returns 401
  - `authContext` contains `userId` and `email` extracted from token
  - A GET `/api/auth/me` protected endpoint returns current user info when authenticated
- Implementation file(s): `playground/src/auth/middleware.ts`, `playground/src/routes/auth.ts` (add `/me` endpoint)

#### Must-Haves
**Truths:**
- Middleware reads JWT from `Authorization: Bearer <token>` header
- Middleware calls `verifyToken` and sets auth context on Hono's `c.set()`
- Failed auth returns `{ error: "Unauthorized" }` with status 401
- GET `/api/auth/me` returns `{ userId, email }` for authenticated users
- Auth context type is exported for use by downstream slices

**Artifacts:**
- `playground/src/auth/middleware.ts` — Auth middleware for Hono, min 15 lines, exports `authMiddleware`, `getAuthContext`
- `playground/src/types.ts` — Updated with `AuthContext` type, exports `AuthContext`

**Key Links:**
- `playground/src/auth/middleware.ts` imports `verifyToken` from `playground/src/auth/jwt.ts`
- `playground/src/auth/middleware.ts` imports `AuthContext` from `playground/src/types.ts`
- `playground/src/routes/auth.ts` imports `authMiddleware` from `playground/src/auth/middleware.ts`
- S02, S03, S04 will import `authMiddleware` and `AuthContext` from `playground/src/auth/middleware.ts`

#### Must-NOT-Haves
- No role-based access control (RBAC)
- No refresh token logic
- No token blacklisting/revocation
- No cookie-based auth — header-only
