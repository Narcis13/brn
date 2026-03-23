---
title: hono/jwt verify() requires explicit algorithm — will throw without it
type: anti-pattern
confidence: verified
source: run-001
feature: auth-and-boards
created: 2026-03-23
---

## Problem
Calling `verify(token, secret)` from `hono/jwt` without specifying the algorithm throws `JwtAlgorithmRequired`. The error message is clear, but the symptom in a middleware context is every authenticated request returning 401 — which looks like a token problem, not a missing parameter.

## Solution
Always pass the algorithm as the third argument:
```typescript
const payload = await verify(token, secret, "HS256");
```

## Context
This is a security feature in recent Hono versions — requiring explicit algorithm prevents algorithm confusion attacks (where an attacker tricks the verifier into using a different algorithm). The `sign()` function defaults to HS256, so you must match it in `verify()`.
