---
name: status
description: Show current BRN feature progress — acceptance criteria, run history, vault size, steering directives, and estimated completion.
user-invocable: true
model: sonnet
effort: medium
---

# /status — Progress Dashboard

Read the BRN state and display a clear progress report.

## Instructions

1. Read these files in parallel:
   - `.brn/state.json`
   - `.brn/steering.md`
   - `.brn/history/index.json`
   - Count files in `.brn/vault/` subdirectories

2. If `state.json` doesn't exist, report: "No active feature. Drop a spec in `.brn/specs/` and run `/next`."

3. Display this dashboard:

```
Feature: <feature name>
Branch:  <branch name>
Status:  <status>
Runs:    <run_count>

Acceptance Criteria:
  [x] AC1: Users can sign up with email/password
  [ ] AC2: Users can log in and receive JWT
  [ ] AC3: Board CRUD with three fixed columns
  Progress: 1/5 (20%)

Last Run: run-003 (2h ago)
  Focus: auth signup endpoint
  Result: success
  Model: sonnet

Vault: 4 patterns, 2 anti-patterns, 1 decision, 1 codebase insight

Steering:
  Active: 1 directive
  - Use Postgres instead of SQLite
```

4. If `status` is `blocked`, highlight the block reason prominently.

5. Keep the output concise and scannable. No walls of text.
