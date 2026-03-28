---
title: CLI JSON output includes all data
type: codebase
confidence: verified
source: run-003
feature: card-artifacts
created: 2026-03-28
---

## Insight
When CLI commands support `--json` flag, they include ALL available data in the JSON output, even data that might be omitted from the normal display:

```typescript
// In showCard
const jsonPayload = {
  ...detail,
  board_id: column.board_id,
  board_title: board.title,
  column_title: column.title,
  artifacts,  // Always included, even if empty array
};

if (options.json) {
  console.log(JSON.stringify(jsonPayload, null, 2));
  return;
}
```

## Key Points
1. JSON output is handled early in the function
2. Include empty arrays rather than omitting fields
3. Add supplementary data (board_title, column_title) not in normal output
4. Pretty-print with 2-space indentation

## Files Following This Pattern
- src/cli-card.ts (showCard)
- src/cli-board.ts (showBoard)
- src/cli-column.ts
- All CLI show commands