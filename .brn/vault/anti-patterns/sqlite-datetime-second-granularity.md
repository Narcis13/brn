---
title: SQLite datetime('now') has second-level granularity
type: anti-pattern
confidence: verified
source: run-002
feature: social-interactions
created: 2026-03-25
---

## Problem
Tests that create and immediately update a record then assert `updated_at !== created_at` will fail because SQLite's `datetime('now')` returns second-level precision. Both timestamps resolve to the same second.

## Solution
Don't assert on timestamp inequality for operations happening within the same test. Instead verify the field exists and is truthy, or add an artificial delay (not recommended). Better yet, test the actual content change rather than relying on timestamp differences.

## Context
This appears in any test where create + update happen in rapid succession (< 1 second). Common in comment/post editing tests.
