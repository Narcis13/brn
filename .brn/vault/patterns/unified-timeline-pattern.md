---
title: Unified timeline from heterogeneous sources
type: pattern
confidence: verified
source: run-004
feature: social-interactions
created: 2026-03-25
---

## Approach
When building a timeline from multiple entity types (comments, activity), fetch each type separately, map to a common discriminated union type (with `type` field), merge into a single array, and sort by timestamp. This keeps queries simple and avoids complex SQL UNIONs.

## Example
```typescript
type TimelineItem = TimelineComment | TimelineActivity;

const commentItems: TimelineComment[] = comments.map(c => ({ type: "comment", ...c }));
const activityItems: TimelineActivity[] = activity.map(a => ({ type: "activity", ...a }));

const timeline = [...commentItems, ...activityItems]
  .sort((a, b) => {
    const timeA = a.type === "comment" ? a.created_at : a.timestamp;
    const timeB = b.type === "comment" ? b.created_at : b.timestamp;
    return timeB.localeCompare(timeA);
  });
```

## When to Use
Any feed/timeline combining multiple entity types with different schemas (comments + activity, posts + shares, messages + events). Works well when each source has different timestamp field names.
