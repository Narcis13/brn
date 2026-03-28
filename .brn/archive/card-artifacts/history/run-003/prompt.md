# Task: Add Artifacts Section to CLI Card and Board Show Commands

## Objective
Implement AC13 by adding artifact sections to the `takt card show` and `takt board show` commands. The sections should display a table of artifacts without their content (just metadata), and should be omitted entirely when no artifacts exist.

## Acceptance Criteria for This Step
- [ ] AC13: `takt card show` includes Artifacts section (ID/Filename/Type/Size table) between checklist and timeline. `takt board show` includes Board Artifacts section after columns. Sections omitted when empty.

## Spec Context
From the feature specification:
- **`takt card show <id>` (CLI):** Add "Artifacts" section between checklist and timeline. Table format: ID, Filename, Type, Size. If no artifacts, section is omitted.
- **`takt board show <id>` (CLI):** Add "Board Artifacts" section after columns/cards summary. Same table format as card artifacts. If no board-level artifacts, section is omitted.

## Current Codebase State

### File: src/cli-card.ts
```typescript
import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";
import {
  createCard,
  deleteCard,
  getAllColumns,
  getBoardById,
  getCardById,
  getCardDetail,
  getColumnById,
  isBoardMember,
  updateCardWithActivity,
} from "./src/db";
import type { TaktConfig } from "./cli-auth";
import {
  confirmOrExit,
  exitWithError,
  formatDate,
  formatDateTime,
  formatId,
  idText,
  isValidDateInput,
  printSuccess,
  printTable,
  type FormatOptions,
} from "./cli-utils";

// ... other functions ...

export async function showCard(
  db: Database,
  session: TaktConfig,
  cardId: string,
  options: FormatOptions
): Promise<void> {
  const card = getCardById(db, cardId);
  if (!card) {
    exitWithError("Card not found");
  }

  const column = getColumnById(db, card.column_id);
  if (!column) {
    exitWithError("Card not found");
  }

  if (!isBoardMember(db, column.board_id, session.userId)) {
    exitWithError("You are not a member of this board");
  }

  const board = getBoardById(db, column.board_id);
  const detail = getCardDetail(db, cardId, session.userId);
  if (!detail || !board) {
    exitWithError("Card not found");
  }

  const jsonPayload = {
    ...detail,
    board_id: column.board_id,
    board_title: board.title,
    column_title: column.title,
  };

  if (options.json) {
    console.log(JSON.stringify(jsonPayload, null, 2));
    return;
  }

  const checklist = parseChecklistLenient(detail.checklist);

  console.log(`Title: ${detail.title}`);
  console.log(`ID: ${idText(formatId(detail.id, options))}`);
  console.log(`Board: ${board.title}`);
  console.log(`Column: ${column.title}`);

  if (detail.description) {
    console.log("");
    console.log(detail.description);
  }

  if (detail.start_date || detail.due_date) {
    console.log("");
    console.log("Dates:");
    if (detail.start_date) {
      console.log(`  Start: ${formatDate(detail.start_date)}`);
    }
    if (detail.due_date) {
      console.log(`  Due: ${formatDate(detail.due_date)}`);
    }
  }

  console.log("");
  console.log(`Checklist: ${detail.checklist_done}/${detail.checklist_total}`);
  if (checklist.length > 0) {
    checklist.forEach((item, index) => {
      console.log(`  ${index}. [${item.checked ? "x" : " "}] ${item.text}`);
    });
  }

  if (detail.labels.length > 0) {
    console.log("");
    console.log(`Labels: ${detail.labels.map((label) => `${label.name} (${label.color})`).join(", ")}`);
  }

  // NEED TO ADD ARTIFACTS SECTION HERE - between checklist and timeline

  if (detail.timeline.length > 0) {
    console.log("");
    console.log("Recent timeline:");
    detail.timeline.slice(0, 10).forEach((item) => {
      if (item.type === "comment") {
        console.log(`  ${formatDateTime(item.created_at)}  ${item.username}: ${item.content}`);
        return;
      }

      const detailText = formatTimelineDetail(item.detail);
      const suffix = detailText ? ` (${detailText})` : "";
      const actor = item.username ? ` by ${item.username}` : "";
      console.log(`  ${formatDateTime(item.timestamp)}  ${item.action}${suffix}${actor}`);
    });
  }
}
```

### File: src/cli-board.ts
```typescript
export async function showBoard(
  db: Database,
  session: TaktConfig,
  boardId: string,
  options: FormatOptions
): Promise<void> {
  const board = getBoardById(db, boardId);
  if (!board) {
    exitWithError("Board not found");
  }

  if (!isBoardMember(db, boardId, session.userId)) {
    exitWithError("Access denied - you are not a member of this board");
  }

  const members = getBoardMembers(db, boardId);
  const columns = getAllColumns(db, boardId);
  const totalCards = columns.reduce((sum, column) => sum + column.cards.length, 0);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...board,
          member_count: members.length,
          total_cards: totalCards,
          columns: columns.map((column) => ({
            id: column.id,
            title: column.title,
            position: column.position,
            card_count: column.cards.length,
          })),
          members,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Board: ${board.title}`);
  console.log(`ID: ${idText(formatId(board.id, options))}`);
  console.log(`Created: ${formatDate(board.created_at)}`);
  console.log(`Members: ${members.length}`);
  console.log(`Columns: ${columns.length}`);
  console.log(`Total cards: ${totalCards}`);

  if (options.quiet) {
    return;
  }

  console.log("");
  console.log("Columns:");
  columns.forEach((column) => {
    console.log(`  ${column.title} (${column.cards.length} cards)`);
  });

  // NEED TO ADD BOARD ARTIFACTS SECTION HERE - after columns
}
```

### Available Database Functions
From src/db.ts:
```typescript
export function getCardArtifacts(db: Database, cardId: string): ArtifactRow[] {
  return db.query<ArtifactRow, [string]>(
    "SELECT * FROM artifacts WHERE card_id = ? ORDER BY position ASC"
  ).all(cardId);
}

export function getBoardArtifacts(db: Database, boardId: string): ArtifactRow[] {
  return db.query<ArtifactRow, [string]>(
    "SELECT * FROM artifacts WHERE board_id = ? AND card_id IS NULL ORDER BY position ASC"
  ).all(boardId);
}
```

### ArtifactRow Type
From the database schema:
```typescript
interface ArtifactRow {
  id: string;
  board_id: string;
  card_id: string | null;
  filename: string;
  filetype: "md" | "html" | "js" | "ts" | "sh";
  content: string;
  position: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}
```

### Formatting Helper Function
The artifact CLI already has this helper:
```typescript
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
```

## Codebase Architecture (from vault)

### CLI Command Structure Pattern
All CLI commands follow a consistent pattern:
1. Import necessary database functions and utilities
2. Validate access and permissions
3. Fetch data from database
4. Format output based on options (--json, --quiet, normal)
5. Use printTable for tabular data

### CLI Utils Pattern
The printTable function expects either:
- An array of arrays for simple tables
- An array of objects with a columns parameter for object tables

## Patterns to Follow (from vault)

### CLI Command Structure
```markdown
---
title: CLI command structure and utilities
type: pattern
confidence: verified
source: run-001, run-002
feature: takt-cli
created: 2026-02-17
---

## Pattern
All CLI commands follow this structure:
1. Import necessary database functions and utilities
2. Validate access permissions (board membership)
3. Fetch data from database
4. Handle different output formats (json, quiet, normal)
5. Use printTable for tabular displays

## Key Utilities
- `formatId()` - formats IDs based on --full-ids flag
- `formatDate()` - formats dates to YYYY-MM-DD
- `formatDateTime()` - formats timestamps
- `printTable()` - renders aligned tables
- `exitWithError()` - exits with error message

## Output Modes
- `--json`: Raw JSON output
- `--quiet`: Minimal output (IDs only)
- Normal: Human-readable formatted output
```

## Anti-Patterns to Avoid (from vault)

### Never ship unstyled UI
```markdown
---
title: Never ship unstyled UI
type: anti-pattern
confidence: verified
source: run-001
feature: card-artifacts
created: 2026-03-27
---

## Problem
Shipping UI components without proper styling, even if functionally complete.

## Why It Happens
Focusing on functionality first and planning to add styling later.

## Solution
Always include styling with the initial implementation. Use existing CSS patterns.

## Context
This applies to web UI only, not CLI output which uses printTable for formatting.
```

## Constraints
- Import the necessary database functions (getCardArtifacts, getBoardArtifacts)
- Add imports at the top of each file maintaining the existing import order
- Add the artifacts section in the exact location specified (between checklist and timeline for cards, after columns for boards)
- Use printTable utility for consistent table formatting
- Format file sizes using a helper function (copy the formatFileSize from cli-artifact.ts)
- Only show the section if artifacts exist - omit entirely when empty
- For JSON output, include artifacts array in the response
- Maintain exact same table columns: ID, Filename, Type, Size
- Type should be uppercase (e.g., "MD", "JS", "SH")
- NEVER use `any` types, `as any` casts, `@ts-ignore`, or `@ts-expect-error`
- NEVER leave TODO/FIXME/stub in implementation files
- ALWAYS write tests for the new functionality
- Use `import type` for type-only imports
- Prefer `Bun.file()` over `node:fs`

## Expected Outcome
- Files to modify: 
  - src/cli-card.ts - add artifacts section to showCard function
  - src/cli-board.ts - add board artifacts section to showBoard function
- Tests to create:
  - src/cli-card.test.ts - update or create tests for showCard with artifacts
  - src/cli-board.test.ts - update or create tests for showBoard with artifacts
- All tests pass (`bun test`)
- Type check clean (`tsc --noEmit`)

## Final Output
When done, output a detailed summary of:
1. What you built and key decisions made
2. Files created/modified with their purpose
3. Test results (run `bun test` and report)
4. Type check results (run `tsc --noEmit` and report)
5. Any challenges encountered and how you resolved them