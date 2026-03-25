---
title: Collapse-to-expand comment input UX
type: pattern
confidence: verified
source: run-005
feature: social-interactions
created: 2026-03-25
---

## Approach
Show a compact single-line readonly input as the default comment state. On focus, replace it with a full textarea + action buttons (Save, Cancel). This saves vertical space while still being obvious and inviting.

## Example
```tsx
{commentFocused ? (
  <div className="comment-compose">
    <textarea autoFocus rows={3} ... />
    <div className="comment-compose-actions">
      <button onClick={submit} disabled={empty}>Save</button>
      <button onClick={cancel}>Cancel</button>
      <span className="hint">Ctrl+Enter to submit</span>
    </div>
  </div>
) : (
  <input type="text" placeholder="Write a comment..." onFocus={() => setFocused(true)} readOnly />
)}
```

## When to Use
Any input that's usually idle but needs to expand into a richer editing experience — comments, quick notes, inline replies.
