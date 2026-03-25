---
title: Slide-in overlay sidebar with pagination
type: pattern
confidence: verified
source: run-006
feature: social-interactions
created: 2026-03-25
---

## Approach
Implement an activity/notification sidebar as a fixed overlay that slides in from the right. The overlay takes the full viewport (for click-outside detection) while the sidebar panel is positioned `right: 0` with a set width. Uses CSS `@keyframes slideInRight` for the slide animation. Pagination uses a "before" cursor (last item's timestamp) with a "Load more" button that appends new items to the existing list.

## Example
```tsx
// Overlay covers full viewport for click-outside
<div className="activity-sidebar-overlay">
  // Sidebar panel is right-anchored
  <div className="activity-sidebar" ref={sidebarRef}>
    <div className="activity-sidebar-header">...</div>
    <div className="activity-sidebar-body">
      {items.map(item => <div>...</div>)}
      {hasMore && <button onClick={handleLoadMore}>Load more</button>}
    </div>
  </div>
</div>

// CSS
.activity-sidebar-overlay { position: fixed; inset: 0; z-index: 900; }
.activity-sidebar { position: absolute; top: 0; right: 0; bottom: 0; width: 380px; }
```

## When to Use
Any sidebar panel that overlays content without pushing it. Good for activity feeds, notification panels, chat drawers, or detail panels. The overlay background enables easy click-outside dismissal without complex event delegation.
