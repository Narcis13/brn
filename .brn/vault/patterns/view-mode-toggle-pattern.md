---
title: View Mode Toggle Implementation Pattern
type: pattern
confidence: verified
source: calendar-view AC4 implementation
created: 2026-03-24
---

## Pattern
When implementing view mode toggles (tabs) in React components, use local state to manage the active view and conditionally render content based on the selected mode.

## Approach
1. **State Management**: Use `useState` with a union type for view modes
2. **UI Structure**: Place toggle above content that changes, separate from view-specific controls
3. **Conditional Rendering**: Wrap view-specific UI elements (search, filters) in mode checks
4. **Styling**: Use CSS classes with active state modifiers for highlighting

## Example
```tsx
export type ViewMode = "board" | "calendar";

const [viewMode, setViewMode] = useState<ViewMode>("board");

// Toggle UI
<div className="board-view-tabs">
  <button 
    className={`board-view-tab${viewMode === "board" ? " active" : ""}`}
    onClick={() => setViewMode("board")}
  >
    Board
  </button>
  <span className="board-view-divider">|</span>
  <button 
    className={`board-view-tab${viewMode === "calendar" ? " active" : ""}`}
    onClick={() => setViewMode("calendar")}
  >
    Calendar
  </button>
</div>

// Conditional content
{viewMode === "board" && <BoardContent />}
{viewMode === "calendar" && <CalendarContent />}
```

## When to Use
- Multiple views of the same data in a single component
- Tab-like navigation that doesn't require routing
- Preserving component state across view changes
- Quick client-side switching without page reloads

## Benefits
- No routing complexity for simple view switches
- Preserves component state (filters, selections)
- Smooth transitions without page flicker
- Clear visual feedback with active states