---
task: T02
slice: S01
milestone: M001
status: pending
---

## Goal
Password & JWT Utilities

**Goal:** Create pure utility modules for password hashing (via `Bun.password`) and JWT token generation/verification so auth endpoints can use them.

#### TDD Sequence
- Test file(s): `playground/src/auth/password.test.ts`, `playground/src/auth/jwt.test.ts`
- Test cases:
  - `hashPassword` returns a string different from the input
  - `verifyPassword` returns true for correct password
  - `verifyPassword` returns false for incorrect password
  - `generateToken` returns a non-empty string
  - `verifyToken` returns the payload for a valid token
  - `verifyToken` throws/returns null for an invalid token
  - `verifyToken` throws/returns null for an expired token
  - Token payload contains `userId` and `email`
- Implementation file(s): `playground/src/auth/password.ts`, `playground/src/auth/jwt.ts`

#### Must-Haves
**Truths:**
- Password hashing uses `Bun.password.hash` with bcrypt algorithm
- Password verification uses `Bun.password.verify`
- JWT tokens encode `userId` and `email` in payload
- JWT tokens have a configurable expiration (default 24h)
- JWT signing uses a secret from environment variable `JWT_SECRET`

**Artifacts:**
- `playground/src/auth/password.ts` — Password hash/verify wrappers, min 8 lines, exports `hashPassword`, `verifyPassword`
- `playground/src/auth/jwt.ts` — JWT sign/verify functions, min 20 lines, exports `generateToken`, `verifyToken`, `TokenPayload`

**Key Links:**
- `playground/src/auth/jwt.ts` imports `TokenPayload` type (defined locally or from `playground/src/types.ts`)

#### Must-NOT-Haves
- No route handlers (that's T03)
- No middleware (that's T04)
- No direct database access — these are pure utility functions
- No third-party JWT library — use Hono's `hono/jwt` helper or manual implementation with Web Crypto API
