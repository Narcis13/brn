---
title: Test Coverage Gaps
type: learning
source: M001/S03
created: 2026-03-20
tags: [testing, coverage, security]
---

## The Problem
Critical service functions (getCardsByBoard, getCardById) implemented without tests, missing authorization validation coverage.

## Root Cause
Tests written only for "interesting" functions, skipping "simple" ones that still need authorization checks.

## Solution
Every public function needs tests, especially those with:
- Authorization checks
- Database queries
- Error conditions
- User input handling

## Action Items
- Write tests for ALL exported functions
- Focus on security-critical paths
- Test authorization failures explicitly
- Use coverage reports to find gaps