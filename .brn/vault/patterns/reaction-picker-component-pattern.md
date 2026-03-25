---
title: Self-contained reaction picker with hover trigger
type: pattern
confidence: verified
source: run-006
feature: social-interactions
created: 2026-03-25
---

## Approach
Create a self-contained `ReactionBar` component that manages its own picker state. Each timeline item gets its own instance. The smiley icon trigger is invisible by default and appears on parent hover via CSS (`.timeline-item:hover .btn-add-reaction`). The emoji picker is positioned absolutely above the trigger. Clicking an emoji calls the toggle API and triggers a parent refresh.

## Example
```tsx
function ReactionBar({ boardId, targetType, targetId, reactions, currentUserId, onReactionToggled }) {
  const [showPicker, setShowPicker] = useState(false);
  // Click-outside to dismiss picker
  // Each emoji button calls toggleReaction API then onReactionToggled callback
  // Existing reaction chips are clickable buttons (not spans) that also toggle
  return (
    <div className="reaction-bar-wrapper">
      <div className="reaction-bar-row">
        {reactions.map(r => <button className={`reaction-chip${r.user_ids.includes(currentUserId) ? " reaction-mine" : ""}`}>...)
        <button className="btn-add-reaction">{smiley}</button>
      </div>
      {showPicker && <div className="reaction-picker">{ALLOWED_EMOJI.map(...)}</div>}
    </div>
  );
}
```

## When to Use
Any place where items in a list need per-item reaction/emoji support. The pattern avoids lifting reaction state to the parent — each instance is independent and just calls a refresh callback when something changes.
