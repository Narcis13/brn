---
title: Inline board ownership verification over middleware-based approach
type: decision
confidence: verified
source: run-001
feature: auth-and-boards
created: 2026-03-23
---

## Choice
Board ownership is verified inline in each route handler using a simple helper function (`getVerifiedBoard`), rather than via a Hono middleware on `/api/boards/:boardId/*`.

## Alternatives Considered
1. **Hono middleware on parameterized path**: `app.use("/api/boards/:boardId/*", ...)` — fewer lines per handler, but complex typing with `Context<Env>` generics and uncertain Hono param extraction in middleware context.
2. **Hono sub-app with `.route()`**: Nested router for board-scoped routes — elegant but unclear if parameterized prefixes work correctly with Hono's routing.

## Rationale
The inline approach is ~3 lines per handler and completely transparent. No type gymnastics needed — the helper takes primitive values (db, boardId, userId) and returns `BoardRow | null`. Easy to understand, easy to test, easy to debug. The repetition is negligible compared to the clarity gained.
