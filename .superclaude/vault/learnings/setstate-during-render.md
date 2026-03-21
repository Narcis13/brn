---
title: setState Called During Render Body
type: learning
source: M001/S05
tags: [react, performance, anti-pattern]
---

## Problem
`App.tsx` called `setCurrentView('login')` directly in the render body inside a conditional, triggering an extra synchronous re-render cycle every time the guard was true.

## Root Cause
Guard logic (`!isAuthenticated && currentView === 'boards'`) was written as an imperative state mutation instead of derived state.

## Fix
Never call `setState` during render. Two correct alternatives:
1. Derive the effective view: `const effectiveView = !isAuthenticated ? 'login' : currentView`
2. Wrap in `useEffect` with the auth condition as a dependency

## Impact
Extra render pass on every auth-state check; React will warn in StrictMode.
