---
title: JWT auth with hono/jwt — zero-dependency auth for Bun+Hono apps
type: pattern
confidence: verified
source: run-001
feature: auth-and-boards
created: 2026-03-23
---

## Approach
Use `hono/jwt`'s `sign` and `verify` functions for JWT token management. No external JWT library needed — Hono ships with full JWT support. Combine with `Bun.password.hash()` for password storage.

## Example
```typescript
import { sign, verify } from "hono/jwt";

// Sign (in register/login handlers)
const token = await sign(
  { userId: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
  JWT_SECRET
);

// Verify (in middleware) — MUST pass algorithm explicitly
const payload = await verify(token, JWT_SECRET, "HS256");

// Password hashing (built-in Bun)
const hash = await Bun.password.hash(password);
const valid = await Bun.password.verify(password, hash);
```

## When to Use
Any Bun + Hono project needing JWT authentication. Avoids adding jsonwebtoken or jose as dependencies.
