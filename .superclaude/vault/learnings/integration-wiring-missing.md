---
title: Integration Wiring Missing After Implementation
type: learning
source: M001/S05
tags: [architecture, react, integration, wiring]
---

## Problem
Components were fully implemented (AppLayout, ToastProvider) but never mounted in App.tsx, making them dead code at runtime.

## Root Cause
Tasks were scoped as "create component X" without a dedicated integration task to wire components into the app entry point. Key Links said "App.tsx wraps with X" but no task owned that change.

## Fix
Any task that produces a provider or layout wrapper MUST include wiring it into App.tsx as part of its artifact list. Alternatively, include an explicit integration task in the slice plan that owns all App.tsx wiring.

## Impact
Three of five S05 features were inert at runtime: AppLayout invisible, ToastProvider disconnected, apiClient unused.
