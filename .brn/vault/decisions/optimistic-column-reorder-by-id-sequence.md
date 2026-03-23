---
title: Column reorder persists as a full id sequence after optimistic midpoint placement
type: decision
confidence: verified
source: run-006
feature: rich-cards
created: 2026-03-23
---

## Decision
Column drag-reorder computes `before` or `after` from the hovered column midpoint, reorders the local column array immediately, and persists the final order through the existing `column_ids` API contract.

## Why
The backend reorder endpoint accepts a complete ordered list instead of move operations, so deriving the final sequence on the client keeps the drag interaction simple and avoids extra reconciliation state.

## Tradeoff
The optimistic client reorder must also refresh local `position` values so subsequent drags continue to reflect the latest visual order.
