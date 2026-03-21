---
task: T03
slice: S01
milestone: M001
status: pending
---

## Goal
Auth Endpoints (Signup & Login)

**Goal:** Implement POST `/api/auth/signup` and POST `/api/auth/login` routes that wire together the user repository, password utilities, and JWT utilities.

#### TDD Sequence
- Test file(s): `playground/src/routes/auth.test.ts`
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
- Implementation file(s): `playground/src/routes/auth.ts`

#### Must-Haves
**Truths:**
- Signup creates a new user with hashed password and returns `{ token }` with status 201
- Login verifies credentials and returns `{ token }` with status 200
- Invalid input returns `{ error }` with appropriate HTTP status code
- Duplicate email on signup returns 409 Conflict
- Wrong credentials on login returns 401 Unauthorized (same message for wrong email and wrong password — no user enumeration)
- Passwords are never stored or returned in plaintext

**Artifacts:**
- `playground/src/routes/auth.ts` — Auth route handlers, min 40 lines, exports `authRoutes` (Hono router instance)

**Key Links:**
- `playground/src/routes/auth.ts` imports `createUser`, `findUserByEmail` from `playground/src/user.repo.ts`
- `playground/src/routes/auth.ts` imports `hashPassword`, `verifyPassword` from `playground/src/auth/password.ts`
- `playground/src/routes/auth.ts` imports `generateToken` from `playground/src/auth/jwt.ts`
- `playground/src/index.ts` mounts `authRoutes` at `/api/auth`

#### Must-NOT-Haves
- No auth middleware (that's T04)
- No session management — JWT-only, stateless
- No email verification or password reset flows
- No rate limiting
- No OAuth / social login
