---
title: node:path import in module scope breaks bun test with happy-dom
type: anti-pattern
confidence: verified
source: manual (pre-BRN debugging session)
created: 2026-03-22
---

## Problem
Importing `import { join } from "node:path"` at module scope in a file that's
loaded during `bun test` (even transitively) causes timer-dependent tests to
malfunction when `happy-dom` is configured as the test preload. Specifically,
`setTimeout`-based tests return wrong results (e.g., expired JWT test returns
200 instead of 401).

## Solution
Either:
1. Avoid `node:path` imports in files loaded by tests — use string
   concatenation for simple path joins
2. Move the import inside the function that needs it (not module scope)
3. Use dynamic `import()` inside the function

## Context
Bun 1.3.x with `happy-dom` preload in `bunfig.toml`. The interaction between
Node.js compatibility polyfills and happy-dom's timer/environment setup causes
the issue. Extremely hard to debug — the symptom is unrelated to the import.
