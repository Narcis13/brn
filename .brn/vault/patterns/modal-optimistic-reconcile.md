---
title: Optimistic modal edits with authoritative refetch
type: pattern
confidence: verified
source: run-005
feature: rich-cards
created: 2026-03-23
---

## Approach
When a modal edits a server-backed entity field-by-field, update the local modal state and the board summary immediately, then reconcile with a fresh detail fetch after the request completes.

## Why It Worked Here
- The board stayed visually current while title, dates, labels, and checklist changes were being saved.
- The follow-up detail fetch refreshed activity entries and server-derived counters without forcing a full board reload after every edit.
- Rollback stayed straightforward because each field mutation captured the previous card snapshot before the request.

## Practical Rule
Use optimistic local state for responsiveness, but refetch the authoritative detail after success when the server also mutates related derived data such as activity logs or computed progress counts.
