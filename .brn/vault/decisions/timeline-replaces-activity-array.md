---
title: Card detail timeline replaces flat activity array
type: decision
confidence: verified
source: run-004
feature: social-interactions
created: 2026-03-25
---

## Choice
The `getCardDetail` response replaces the `activity: ActivityRow[]` field with `timeline: TimelineItem[]` — a discriminated union of comments and activity entries, each enriched with reactions and usernames. Also adds `is_watching`, `watcher_count`, and `board_members`.

## Alternatives Considered
1. Keep `activity` array and add separate `comments` array — doubles the data, forces frontend to merge/sort
2. SQL UNION query — complex, harder to maintain, different column shapes require NULL padding
3. Separate API calls for comments vs activity — more HTTP round trips

## Rationale
A single unified timeline is exactly what the frontend needs for rendering. Discriminated union (`type: "comment" | "activity"`) makes it type-safe. The function signature change from `(db, cardId)` to `(db, cardId, userId)` is necessary to compute `is_watching`. Breaking change is acceptable since existing tests were updated.
