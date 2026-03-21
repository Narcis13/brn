---
title: SQLite create:true does not create parent directories
type: anti-pattern
confidence: verified
source: manual (pre-BRN debugging session)
created: 2026-03-22
---

## Problem
`new Database(path, { create: true })` in Bun's SQLite creates the `.db` file
but NOT parent directories. Crashes with `SQLITE_CANTOPEN` (errno 14) if the
directory doesn't exist.

## Solution
```typescript
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

mkdirSync(dirname(dbPath), { recursive: true });
return new Database(dbPath, { create: true });
```

## Context
Bun's built-in `bun:sqlite` binding. Applies to any SQLite path with
directories that may not exist yet (e.g., `./data/app.db` on first run).
