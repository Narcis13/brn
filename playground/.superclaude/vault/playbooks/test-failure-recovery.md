---
title: Test Failure Recovery Playbook
type: playbook
created: 2026-03-20
tags: [testing, debugging, recovery]
---

## When to Use
Tests pass individually but fail in suite, or transient test failures.

## Diagnosis Steps

1. **Identify failing tests**
   ```bash
   bun test --bail  # Stop at first failure
   bun test path/to/failing.test.ts  # Run individually
   ```

2. **Check for shared state**
   - Database files in /tmp
   - Global mocks
   - Module-level variables
   - Process.env modifications

3. **Look for timing issues**
   - Tests using sleep/setTimeout
   - Missing await on async operations
   - Race conditions in parallel tests

## Recovery Steps

1. **Quick fix** (temporary)
   ```bash
   bun test --serial  # Run tests sequentially
   ```

2. **Proper fix**
   - Add unique test database paths
   - Complete cleanup in afterEach
   - Remove module-level side effects
   - Add proper async/await

3. **Verify fix**
   ```bash
   bun test  # Full suite
   bun test --watch  # Multiple runs
   ```

## Prevention
- Always use isolated test databases
- No global state modifications
- Proper test lifecycle hooks
- Review test dependencies