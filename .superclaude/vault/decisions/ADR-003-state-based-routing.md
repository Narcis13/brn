---
title: State-Based Routing vs React Router
type: decision
source: M001/S04
tags: [architecture, frontend, routing]
---

## Context
Frontend needed routing between auth views, board list, and individual boards.

## Decision
Use simple state-based routing with a `currentView` state variable instead of React Router.

## Alternatives Considered
1. **React Router** - Full-featured routing library with URL management
2. **Next.js Router** - If using Next.js framework
3. **State-based** - Simple state variable to control rendered component

## Rationale
- MVP scope doesn't need URL persistence or browser back button
- Reduces dependencies and bundle size
- Easier to test without router mocking
- Can migrate to React Router later if needed

## Consequences
- No shareable URLs for specific boards
- No browser history navigation
- Simpler implementation and testing
- Clear migration path exists if needed