---
title: Test Failure Recovery Playbook
type: playbook
created: 2026-03-20
updated_by: evolver
tags: [playbook, testing, debugging]
---

## Symptom
Tests pass individually but fail when run as a suite.

## Diagnosis Steps

1. **Run failing test in isolation**
   ```bash
   bun test path/to/failing.test.ts
   ```

2. **Check for shared state**
   - Database files
   - Global mocks
   - Environment variables
   - File system state

3. **Common causes**
   - SQLite database file collision
   - Bun mock.module is global
   - Test order dependencies
   - Missing cleanup in afterEach

## Recovery Steps

### For Database Collisions
1. Make each test use unique DB path:
   ```typescript
   const dbPath = `/tmp/test-${moduleName}-${Date.now()}.db`;
   ```

2. Add proper cleanup:
   ```typescript
   afterEach(() => {
     if (existsSync(dbPath)) {
       unlinkSync(dbPath);
     }
   });
   ```

### For Mock Issues
1. Clear mocks between tests:
   ```typescript
   afterEach(() => {
     mock.restore();
   });
   ```

2. Consider in-memory alternatives instead of mocks

### For State Dependencies
1. Reset all state in beforeEach
2. Never rely on test execution order
3. Each test must be completely independent

## Prevention
- Always use unique paths for test artifacts
- Always clean up in afterEach
- Run full test suite locally before pushing
- Use `--sequential` flag if parallelism causes issues