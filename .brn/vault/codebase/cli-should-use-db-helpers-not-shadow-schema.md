---
title: CLI modules should reuse src/src/db.ts helpers instead of shadowing the schema in raw SQL
type: codebase
confidence: verified
source: run-007
feature: takt-cli
created: 2026-03-25
---

## Insight
The previous column CLI implementation had drifted onto camelCase column names that only existed in its custom tests, not in the real application schema. Reusing the DB helper layer from `src/src/db.ts` keeps CLI behavior aligned with the web API and with migrations.

## Implication
When adding more CLI commands in this repo, prefer wrapping existing DB helpers first and only add new SQL in the CLI if the helper layer truly lacks the required behavior.
