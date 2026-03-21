---
title: Inline @keyframes Injected Per Component Instance
type: learning
source: M001/S05
tags: [react, performance, css, anti-pattern]
---

## Problem
`LoadingSpinner` injected a `<style>` tag containing `@keyframes spin` directly inside its render output. Each mounted spinner added a duplicate `<style>` element to the DOM.

## Root Cause
Inline CSS-in-JS without deduplication logic — convenient to write but not safe to repeat.

## Fix
Move `@keyframes` to a global stylesheet or inject once via a module-level side effect with an existence check:
```typescript
if (!document.getElementById('spinner-keyframes')) {
  const style = document.createElement('style');
  style.id = 'spinner-keyframes';
  style.textContent = `@keyframes spin { ... }`;
  document.head.appendChild(style);
}
```
Prefer a shared CSS file or CSS module for animation definitions.

## Impact
DOM bloat proportional to spinner count; negligible at low counts, noticeable in lists.
