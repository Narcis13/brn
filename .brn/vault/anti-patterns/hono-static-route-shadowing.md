---
title: Static Hono routes placed after parameter routes get shadowed
type: anti-pattern
confidence: verified
source: run-004
feature: rich-cards
created: 2026-03-23
---

## Problem
Registering `PATCH /api/boards/:boardId/columns/reorder` after `PATCH /api/boards/:boardId/columns/:id` causes Hono to treat `reorder` as the `:id` parameter. The request then fails inside the wrong handler with a misleading `404`.

## Solution
Declare static routes like `/reorder` before sibling parameter routes like `/:id`, especially when they share the same HTTP method.

## Signal
Focused endpoint tests returned `404` for valid reorder requests until the route order was corrected.
