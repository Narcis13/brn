---
title: Conditional sections in CLI output
type: pattern
confidence: verified
source: run-003
feature: card-artifacts
created: 2026-03-28
---

## Pattern
CLI output sections should be completely omitted when they have no data, not shown as empty:

```typescript
// Good - section omitted entirely when empty
if (artifacts.length > 0) {
  console.log("");
  console.log("Artifacts:");
  printTable(/* ... */);
}

// Bad - shows empty section
console.log("");
console.log("Artifacts:");
if (artifacts.length === 0) {
  console.log("  No artifacts");
}
```

## Benefits
- Cleaner output
- Focuses user attention on what exists
- Reduces visual noise

## Implementation
1. Check data length/existence first
2. Only render section header if data exists
3. Include blank line before section for spacing

## When to Apply
- Optional data sections (artifacts, labels, timeline)
- Metadata that might not exist
- Any section that could be empty