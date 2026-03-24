---
title: Date-only board filters must use local YYYY-MM-DD formatting
type: codebase
confidence: verified
source: run-004
feature: rich-cards
created: 2026-03-23
---

## Insight
This codebase stores card due dates as date-only strings (`YYYY-MM-DD`). Search filters should compare against locally formatted date strings, not `toISOString().split("T")[0]`, which can shift the day backward in positive UTC offsets.

## Affected Code
- `trello/src/db.ts` search due-date buckets
- `trello/src/routes-search-reorder.test.ts` date fixtures

## Practical Rule
Normalize the comparison date with local calendar components and use noon before day arithmetic to avoid DST edge cases.
