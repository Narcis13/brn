---
title: Shared CLI utility layer for formatting, auth context, and destructive flows
type: pattern
confidence: verified
source: run-007
feature: takt-cli
created: 2026-03-25
---

## Approach
When the CLI surface spans multiple resources, keep parsing, table rendering, ID formatting, DB resolution, and auth/session loading in a shared helper module instead of duplicating those concerns per command file.

## Why
This keeps command modules focused on resource behavior, makes the UX consistent across commands, and avoids spec drift around global flags like `--json`, `--quiet`, `--full-ids`, and `--yes`.
