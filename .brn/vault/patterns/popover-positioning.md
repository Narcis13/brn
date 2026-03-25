# Pattern: Viewport-Aware Popover Positioning

## Approach
When showing a popover near a click point, ensure it stays within viewport boundaries to prevent clipping.

## Example
```typescript
const popoverStyle: React.CSSProperties = {
  position: "fixed",
  left: Math.min(position.x, window.innerWidth - popoverWidth),
  top: Math.min(position.y, window.innerHeight - popoverHeight),
  zIndex: 1000
};
```

## When to Use
- Click-triggered popovers that appear near cursor
- Tooltips that need to stay visible
- Context menus
- Any floating UI that follows user interaction

## Confidence
verified - Successfully used in calendar quick-create popover