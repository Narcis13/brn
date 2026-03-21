---
title: React setTimeout Leak on Early Dismiss
type: learning
source: M001/S05
tags: [react, performance, memory-leak, timers]
---

## Problem
`ToastContext` used `setTimeout` for auto-dismiss but never cleared the timer when a toast was manually dismissed or the component unmounted, causing state updates on unmounted components.

## Root Cause
`setTimeout` returns a timer ID that must be tracked and cancelled. Without a `useRef<Map<string, ReturnType<typeof setTimeout>>>`, there is no way to cancel pending timers.

## Fix
```typescript
const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

function addToast(toast) {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  timersRef.current.set(id, timer);
}

function dismissToast(id) {
  clearTimeout(timersRef.current.get(id));
  timersRef.current.delete(id);
  setToasts(prev => prev.filter(t => t.id !== id));
}

useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
```

## Impact
React warning "Can't perform a state update on an unmounted component" and potential memory leaks under rapid create/dismiss cycles.
