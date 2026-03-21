---
title: Database Test Isolation
type: learning
source: M001/S03
tags: [testing, database, bun, sqlite]
---

## Problem
Session report indicated "1 test(s) failing on S03" - tests failed in suite but passed individually.

## Root Cause
SQLite file-based databases can share state when test files run in parallel. Without proper isolation, tests affect each other.

## Fix
Each test file MUST create its own database instance with a unique path like `/tmp/test-${moduleName}-${Date.now()}.db`.

## Example
```typescript
// GOOD
const dbPath = `/tmp/card-repo-test-${Date.now()}.db`;
```