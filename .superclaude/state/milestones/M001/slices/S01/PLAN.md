---
slice: S01
milestone: M001
status: planned
demo_sentence: "After this, the user can sign up with email/password and log in to receive a JWT token"
---

## Tasks

### T01: Project Foundation & User Repository
**Goal:** Stand up the Hono server, SQLite database, user table, and user repository so downstream tasks have infrastructure to build on.

#### TDD Sequence
- Test file(s): `src/db.test.ts`, `src/user.repo.test.ts`
- Test cases:
  - Database connection initializes without error
  - User table exists after migration
  - `createUser` inserts a user and returns it with an `id`
  - `findUserByEmail` returns the user when found
  - `findUserByEmail` returns null when not found
  - `createUser` rejects duplicate emails (UNIQUE constraint)
- Implementation file(s): `src/index.ts`, `src/db.ts`, `src/user.repo.ts`, `src/types.ts`

#### Must-Haves
**Truths:**
- `bun run src/index.ts` starts a Hono server on a configurable port
- SQLite database file is created at a configurable path
- User table has columns: `id` (TEXT, UUID primary key), `email` (TEXT, UNIQUE, NOT NULL), `password_hash` (TEXT, NOT NULL), `created_at` (TEXT, NOT NULL)
- Repository functions operate correctly against real SQLite

**Artifacts:**
- `src/index.ts` — Hono app creation and server start, min 10 lines, exports `app`
- `src/db.ts` — SQLite connection and migration, min 15 lines, exports `getDb`, `runMigrations`
- `src/user.repo.ts` — User CRUD operations, min 20 lines, exports `createUser`, `findUserByEmail`
- `src/types.ts` — Shared type definitions, min 10 lines, exports `User`, `NewUser`

**Key Links:**
- `src/user.repo.ts` imports `getDb` from `src/db.ts`
- `src/user.repo.ts` imports `User`, `NewUser` from `src/types.ts`
- `src/index.ts` imports `runMigrations` from `src/db.ts`

#### Must-NOT-Haves
- No password hashing logic (that's T02)
- No JWT logic (that's T02)
- No route handlers (that's T03)
- No ORM — use raw SQL via Bun's built-in `bun:sqlite`
- No environment variable validation library — just read from `process.env` or `Bun.env`

---

### T02: Password & JWT Utilities
**Goal:** Create pure utility modules for password hashing (via `Bun.password`) and JWT token generation/verification so auth endpoints can use them.

#### TDD Sequence
- Test file(s): `src/auth/password.test.ts`, `src/auth/jwt.test.ts`
- Test cases:
  - `hashPassword` returns a string different from the input
  - `verifyPassword` returns true for correct password
  - `verifyPassword` returns false for incorrect password
  - `generateToken` returns a non-empty string
  - `verifyToken` returns the payload for a valid token
  - `verifyToken` throws/returns null for an invalid token
  - `verifyToken` throws/returns null for an expired token
  - Token payload contains `userId` and `email`
- Implementation file(s): `src/auth/password.ts`, `src/auth/jwt.ts`

#### Must-Haves
**Truths:**
- Password hashing uses `Bun.password.hash` with bcrypt algorithm
- Password verification uses `Bun.password.verify`
- JWT tokens encode `userId` and `email` in payload
- JWT tokens have a configurable expiration (default 24h)
- JWT signing uses a secret from environment variable `JWT_SECRET`

**Artifacts:**
- `src/auth/password.ts` — Password hash/verify wrappers, min 8 lines, exports `hashPassword`, `verifyPassword`
- `src/auth/jwt.ts` — JWT sign/verify functions, min 20 lines, exports `generateToken`, `verifyToken`, `TokenPayload`

**Key Links:**
- `src/auth/jwt.ts` imports `TokenPayload` type (defined locally or from `src/types.ts`)

#### Must-NOT-Haves
- No route handlers (that's T03)
- No middleware (that's T04)
- No direct database access — these are pure utility functions
- No third-party JWT library — use Hono's `hono/jwt` helper or manual implementation with Web Crypto API

---

### T03: Auth Endpoints (Signup & Login)
**Goal:** Implement POST `/api/auth/signup` and POST `/api/auth/login` routes that wire together the user repository, password utilities, and JWT utilities.

#### TDD Sequence
- Test file(s): `src/routes/auth.test.ts`
- Test cases:
  - POST `/api/auth/signup` with valid email/password returns 201 and a JWT token
  - POST `/api/auth/signup` with missing email returns 400
  - POST `/api/auth/signup` with missing password returns 400
  - POST `/api/auth/signup` with invalid email format returns 400
  - POST `/api/auth/signup` with short password (< 8 chars) returns 400
  - POST `/api/auth/signup` with duplicate email returns 409
  - POST `/api/auth/login` with valid credentials returns 200 and a JWT token
  - POST `/api/auth/login` with wrong password returns 401
  - POST `/api/auth/login` with non-existent email returns 401
  - POST `/api/auth/login` with missing fields returns 400
  - Returned token is a valid JWT containing `userId` and `email`
- Implementation file(s): `src/routes/auth.ts`

#### Must-Haves
**Truths:**
- Signup creates a new user with hashed password and returns `{ token }` with status 201
- Login verifies credentials and returns `{ token }` with status 200
- Invalid input returns `{ error }` with appropriate HTTP status code
- Duplicate email on signup returns 409 Conflict
- Wrong credentials on login returns 401 Unauthorized (same message for wrong email and wrong password — no user enumeration)
- Passwords are never stored or returned in plaintext

**Artifacts:**
- `src/routes/auth.ts` — Auth route handlers, min 40 lines, exports `authRoutes` (Hono router instance)

**Key Links:**
- `src/routes/auth.ts` imports `createUser`, `findUserByEmail` from `src/user.repo.ts`
- `src/routes/auth.ts` imports `hashPassword`, `verifyPassword` from `src/auth/password.ts`
- `src/routes/auth.ts` imports `generateToken` from `src/auth/jwt.ts`
- `src/index.ts` mounts `authRoutes` at `/api/auth`

#### Must-NOT-Haves
- No auth middleware (that's T04)
- No session management — JWT-only, stateless
- No email verification or password reset flows
- No rate limiting
- No OAuth / social login

---

### T04: Auth Middleware & Protected Routes
**Goal:** Create Hono middleware that verifies JWT tokens and extracts user context, establishing the contract consumed by S02, S03, and S04.

#### TDD Sequence
- Test file(s): `src/auth/middleware.test.ts`
- Test cases:
  - Request with valid `Authorization: Bearer <token>` header passes through with `authContext` set
  - Request without `Authorization` header returns 401
  - Request with malformed `Authorization` header returns 401
  - Request with expired token returns 401
  - Request with invalid token returns 401
  - `authContext` contains `userId` and `email` extracted from token
  - A GET `/api/auth/me` protected endpoint returns current user info when authenticated
- Implementation file(s): `src/auth/middleware.ts`, `src/routes/auth.ts` (add `/me` endpoint)

#### Must-Haves
**Truths:**
- Middleware reads JWT from `Authorization: Bearer <token>` header
- Middleware calls `verifyToken` and sets auth context on Hono's `c.set()`
- Failed auth returns `{ error: "Unauthorized" }` with status 401
- GET `/api/auth/me` returns `{ userId, email }` for authenticated users
- Auth context type is exported for use by downstream slices

**Artifacts:**
- `src/auth/middleware.ts` — Auth middleware for Hono, min 15 lines, exports `authMiddleware`, `getAuthContext`
- `src/types.ts` — Updated with `AuthContext` type, exports `AuthContext`

**Key Links:**
- `src/auth/middleware.ts` imports `verifyToken` from `src/auth/jwt.ts`
- `src/auth/middleware.ts` imports `AuthContext` from `src/types.ts`
- `src/routes/auth.ts` imports `authMiddleware` from `src/auth/middleware.ts`
- S02, S03, S04 will import `authMiddleware` and `AuthContext` from `src/auth/middleware.ts`

#### Must-NOT-Haves
- No role-based access control (RBAC)
- No refresh token logic
- No token blacklisting/revocation
- No cookie-based auth — header-only

---

## Boundary Contracts

### S01 Produces (consumed by downstream slices)

| Export | File | Type Signature | Consumed By |
|---|---|---|---|
| `authMiddleware` | `src/auth/middleware.ts` | `MiddlewareHandler` (Hono) | S02, S03, S04 |
| `getAuthContext` | `src/auth/middleware.ts` | `(c: Context) => AuthContext` | S02, S03 |
| `AuthContext` | `src/types.ts` | `{ userId: string; email: string }` | S02, S03, S04 |
| `app` | `src/index.ts` | `Hono` instance | S04 (static serving) |
| `getDb` | `src/db.ts` | `() => Database` | S02, S03 (own tables) |
| `runMigrations` | `src/db.ts` | `() => void` | Entry point |

### S01 Consumes
Nothing — S01 has no upstream dependencies.

## Upstream Summaries
None — S01 is the first slice.

## Dependency Installation
T01 must install these packages before implementation:
- `hono` — Web framework
- No other runtime deps needed (Bun provides SQLite, password hashing, and crypto natively)
