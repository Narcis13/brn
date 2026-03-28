---
title: CLI table formatting with printTable utility
type: pattern
confidence: verified
source: run-003
feature: card-artifacts
created: 2026-03-28
---

## Pattern
When displaying tabular data in CLI commands, use the `printTable` utility with consistent column formatting:

```typescript
printTable(
  ["ID", "Filename", "Type", "Size"],
  artifacts.map((artifact) => [
    formatId(artifact.id, options),
    artifact.filename,
    artifact.filetype.toUpperCase(),
    formatFileSize(artifact.content.length),
  ])
);
```

## Key Elements
1. Column headers as first argument
2. Data rows as second argument (array of arrays)
3. Use formatting utilities:
   - `formatId()` for IDs (respects --full-ids flag)
   - `formatFileSize()` for bytes → human-readable
   - `.toUpperCase()` for enums/types

## Example
```typescript
// Artifacts section in card show
if (artifacts.length > 0) {
  console.log("");
  console.log("Artifacts:");
  printTable(
    ["ID", "Filename", "Type", "Size"],
    artifacts.map((artifact) => [
      formatId(artifact.id, options),
      artifact.filename,
      artifact.filetype.toUpperCase(),
      formatFileSize(artifact.content.length),
    ])
  );
}
```

## When to Apply
- Any CLI command that displays multiple records
- When data has consistent columns
- When user needs to scan/compare values