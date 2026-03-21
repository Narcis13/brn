---
title: Sequential Awaits in Batch Operations (N+1 Network)
type: learning
source: M001/S05
tags: [performance, api, async]
---

## Problem
`batchUpdateCards` used a `for` loop with `await` inside, sending card updates one-by-one serially. N cards = N sequential round-trips.

## Root Cause
Sequential `await` in a loop is the default naive pattern; `Promise.all` requires an intentional choice.

## Fix
Use `Promise.all` for independent parallel operations:
```typescript
// BAD
for (const update of updates) {
  await apiClient.put(...)
}

// GOOD
await Promise.all(updates.map(u => apiClient.put(...)))
```
For truly large batches, consider a server-side batch endpoint instead.

## Impact
Latency scales linearly with batch size. A 10-card drag-drop reorder takes ~10× longer than necessary.
