---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
Project Foundation & User Repository

**Goal:** Stand up the Hono server, SQLite database, user table, and user repository so downstream tasks have infrastructure to build on.

#### TDD Sequence
- Test file(s): `playground/src/db.test.ts`, `playground/src/user.repo.test.ts`
- Test cases:
  - Database connection initializes without error
  - User table exists after migration
  - `createUser` inserts a user and returns it with an `id`
  - `findUserByEmail` returns the user when found
  - `findUserByEmail` returns null when not found
  - `createUser` rejects duplicate emails (UNIQUE constraint)
- Implementation file(s): `playground/src/index.ts`, `playground/src/db.ts`, `playground/src/user.repo.ts`, `playground/src/types.ts`

#### Must-Haves
**Truths:**
- `bun run playground/src/index.ts` starts a Hono server on a configurable port
- SQLite database file is created at a configurable path
- User table has columns: `id` (TEXT, UUID primary key), `email` (TEXT, UNIQUE, NOT NULL), `password_hash` (TEXT, NOT NULL), `created_at` (TEXT, NOT NULL)
- Repository functions operate correctly against real SQLite

**Artifacts:**
- `playground/src/index.ts` — Hono app creation and server start, min 10 lines, exports `app`
- `playground/src/db.ts` — SQLite connection and migration, min 15 lines, exports `getDb`, `runMigrations`
- `playground/src/user.repo.ts` — User CRUD operations, min 20 lines, exports `createUser`, `findUserByEmail`
- `playground/src/types.ts` — Shared type definitions, min 10 lines, exports `User`, `NewUser`

**Key Links:**
- `playground/src/user.repo.ts` imports `getDb` from `playground/src/db.ts`
- `playground/src/user.repo.ts` imports `User`, `NewUser` from `playground/src/types.ts`
- `playground/src/index.ts` imports `runMigrations` from `playground/src/db.ts`

#### Must-NOT-Haves
- No password hashing logic (that's T02)
- No JWT logic (that's T02)
- No route handlers (that's T03)
- No ORM — use raw SQL via Bun's built-in `bun:sqlite`
- No environment variable validation library — just read from `process.env` or `Bun.env`
