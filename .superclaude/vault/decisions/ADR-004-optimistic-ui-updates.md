---
title: Optimistic UI Updates Pattern
type: decision
source: M001/S04
tags: [architecture, frontend, ux, performance]
---

## Context
Card operations (create, update, move) need responsive UI feedback despite network latency.

## Decision
Implement optimistic updates that immediately update UI state, then reconcile with server response.

## Alternatives Considered
1. **Pessimistic updates** - Wait for server response before updating UI
2. **Optimistic with rollback** - Update immediately, rollback on error
3. **Hybrid approach** - Optimistic for some operations, pessimistic for others

## Rationale
- Better perceived performance for users
- Card movements feel instant during drag-drop
- Server is source of truth for reconciliation
- Rollback provides error recovery

## Implementation
- useCards hook manages optimistic state
- Immediate UI update on user action
- Server call happens in background
- On error, revert to previous state
- Success replaces optimistic state with server response