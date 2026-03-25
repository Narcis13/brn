---
title: Prefer the local project DB over the saved session DB when inside the Takt repo
type: decision
confidence: verified
source: run-007
feature: takt-cli
created: 2026-03-25
---

## Decision
CLI commands resolve the database path to the local project `data/kanban.db` when the current working directory is inside the Takt project. Outside the project, commands fall back to the saved `dbPath` from `~/.takt/config.json`.

## Rationale
This matches the spec, preserves the expected local-development behavior, and still lets a globally linked `takt` binary work from arbitrary directories after login.
