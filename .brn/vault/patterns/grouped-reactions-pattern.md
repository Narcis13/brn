---
title: Batch-fetch and group reactions by target
type: pattern
confidence: verified
source: run-004
feature: social-interactions
created: 2026-03-25
---

## Approach
When attaching reactions to multiple items (timeline entries), batch-fetch all reactions for all target IDs in one query, then group in-memory by target_id and emoji. Returns a Map for O(1) lookup per item. Avoids N+1 queries.

## Example
```typescript
function getReactionsGrouped(db, targetType, targetIds): Map<string, ReactionGroup[]> {
  const placeholders = targetIds.map(() => "?").join(",");
  const rows = db.query(
    `SELECT target_id, emoji, user_id FROM reactions
     WHERE target_type = ? AND target_id IN (${placeholders})`
  ).all(targetType, ...targetIds);

  // Group by target_id → emoji → { count, user_ids }
  const result = new Map();
  for (const row of rows) { /* group logic */ }
  return result;
}
```

## When to Use
Any time you need to attach aggregated sub-data (reactions, tags, votes) to a list of parent items. The key insight is batching the fetch and returning a Map for efficient lookup.
