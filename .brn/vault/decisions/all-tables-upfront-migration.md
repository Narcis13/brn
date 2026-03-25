---
title: Create all social interaction tables in the first migration
type: decision
confidence: verified
source: run-001
feature: social-interactions
created: 2026-03-25
---

## Choice
Created all 4 new tables (board_members, comments, reactions, card_watchers) plus the activity.user_id column in run-001, even though only board_members was immediately needed.

## Alternatives Considered
- Create tables incrementally as each feature is built (one table per run)
- Create only board_members now, defer others

## Rationale
1. Schema migrations are cheap and independent of business logic — no reason to defer
2. Future runs can focus purely on business logic without worrying about schema changes
3. The backfill migration (inserting existing board creators as owners) needs to run exactly once — doing it with all tables avoids running migrations in multiple passes
4. All tables are defined in the spec with exact schemas, so there's no ambiguity to resolve later
