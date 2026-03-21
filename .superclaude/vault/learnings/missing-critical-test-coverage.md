---
title: Missing Critical Component Test Coverage
type: learning
source: M001/S04
tags: [testing, react, coverage, authentication]
---

## Problem
Critical components (AuthContext, API clients, App routing) had no test files at all.

## Root Cause
TDD enforcement only checked for test files in implemented components, not for all critical paths.

## Fix
Orchestrator should maintain a list of critical components that MUST have test coverage regardless of implementation scope.

## Critical Components
- Authentication flows (context, hooks, API)
- Routing and navigation
- API client error handling
- Global state management