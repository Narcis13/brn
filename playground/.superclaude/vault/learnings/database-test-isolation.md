---
title: Database Test Isolation
type: learning
source: M001/S03
created: 2026-03-20
tags: [testing, database, sqlite, isolation]
---

## The Problem
Tests pass individually but fail when run as a suite due to shared SQLite state between test files.

## Root Cause
Test files share database connections or files, causing:
- State pollution between tests
- Race conditions in parallel execution
- Transient failures requiring session restarts

## Solution
Each test file MUST create its own isolated database:
```typescript
const testDb = `/tmp/superclaude-test-${Date.now()}-${Math.random()}/data.db`;
```

## Action Items
- Use unique temp directories per test file
- Complete cleanup in beforeEach/afterEach
- Never share database state between test files
- Consider sequential test execution for SQLite