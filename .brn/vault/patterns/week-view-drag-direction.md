# Week View Drag Direction Detection

## Approach
Detect user intent when dragging cards in week view by comparing original and target positions to determine if they want to change time (vertical) or date (horizontal).

## Example
```typescript
const detectDragDirection = (
  originalDate: string | null,
  targetDate: string,
  targetTime: string
): "vertical" | "horizontal" => {
  if (!originalDate || !originalDate.includes("T")) return "horizontal";
  
  const originalDateOnly = originalDate.split("T")[0];
  const originalTime = originalDate.split("T")[1];
  
  if (originalDateOnly === targetDate && originalTime !== targetTime) {
    return "vertical"; // Same date, different time
  } else {
    return "horizontal"; // Different date
  }
};
```

## When to Use
- Calendar week view drag-and-drop
- Any time-grid UI where dragging has different meanings based on direction
- When you need to distinguish between time and date changes

## Confidence
verified