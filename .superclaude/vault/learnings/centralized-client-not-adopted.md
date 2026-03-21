---
title: Centralized API Client Built But Not Adopted
type: learning
source: M001/S05
tags: [architecture, api, refactoring, key-links]
---

## Problem
T04 built a centralized `apiClient` with 401 auto-logout, retry logic, and user-friendly errors. Existing `boards.ts` and `cards.ts` kept their own `fetchWithAuth` wrappers, so `apiClient` was dead code.

## Root Cause
The task created a new abstraction but did not include migrating existing callers. Key Links said "All api/*.ts files use apiClient" but the implementer treated it as forward-looking for new files only.

## Fix
When a task introduces a centralized abstraction that replaces existing code, the migration of existing callers must be an explicit must-have in that same task — not left as an implied follow-up.

## Impact
Duplicate 401 handlers with different behaviors (one state-based, one hard `window.location.href` redirect). Security fixes to `apiClient` would not apply to board or card operations.
