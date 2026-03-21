---
title: Unsound `undefined as T` in Generic 204 Handler
type: learning
source: M001/S05
tags: [typescript, type-safety, generics]
---

## Problem
`apiClient.request<T>()` returned `undefined as T` for HTTP 204 responses. For callers like `del()` (T = void) this is safe, but `get<Board>()` receiving a 204 would silently return `undefined` typed as `Board`, causing downstream property-access crashes.

## Root Cause
204 handling was placed in the generic `request<T>` function without constraining which methods can reach that path.

## Fix
Make 204 handling method-specific: only `del()` should call the 204 path, or use an overload that returns `void` for `del` and `T` for all others. Never use `return undefined as T` in a generic function callable with non-void type params.

## Impact
Type-unsound code that TypeScript cannot catch; silent runtime crashes on unexpected 204s from non-delete endpoints.
