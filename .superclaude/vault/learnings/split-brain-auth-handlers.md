---
title: Split-Brain Authentication Handlers
type: learning
source: M001/S05
tags: [security, api, architecture, authentication]
---

## Problem
`boards.ts` and `cards.ts` each had their own `fetchWithAuth` with `window.location.href = "/login"` on 401, while the centralized `apiClient` used `clearToken()` only. Two divergent 401 strategies coexisted.

## Root Cause
Old API modules were not migrated when the centralized client was introduced. Security fixes to `apiClient` silently didn't apply to board/card operations.

## Fix
When introducing a centralized auth wrapper, migration of ALL existing callers is a hard prerequisite in the same task — not an implied follow-up. The hard `window.location.href` redirect also conflicts with state-based routing (ADR-003): use `clearToken()` + state update only.

## Impact
Hard redirects broke the SPA model; security patches applied to one code path missed the other two.
