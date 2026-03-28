---
title: Card & Board Artifacts — File-like content objects attached to cards and boards
status: ready
priority: high
---

## What
Artifacts are typed file-like content objects (markdown, HTML, JavaScript, TypeScript, shell scripts) that attach to cards or boards. They turn Takt cards into rich knowledge containers — a card can carry its spec, deploy script, review notes, and implementation snippets. Board-level artifacts serve as shared project docs (README, runbooks, architecture notes). Shell and JS/TS artifacts can be executed directly from the CLI. Artifacts are fully accessible from both CLI and the React UI.

## Why
Cards currently hold a title, description, checklist, and comments — enough for task tracking but not for the context that makes tasks actionable. Real work produces artifacts: specs, scripts, notes, snippets. Today those live scattered in the filesystem with no link to the task they belong to. Artifacts close that gap — the deploy script lives on the deploy card, the architecture doc lives on the board.

## User Stories
- As a developer, I want to attach a shell script to a card so I can run the deploy procedure directly from the task
- As a team lead, I want to attach a markdown spec to a card so the full context lives with the task
- As a developer, I want to attach board-level docs (README, runbook) so shared knowledge lives with the project
- As a user, I want to import files from my filesystem into artifacts so I don't have to copy-paste content
- As a user, I want to export artifacts back to the filesystem so I can use them outside Takt
- As a user, I want to edit artifacts with my $EDITOR (CLI) or a textarea (UI) so editing is comfortable in both contexts
- As a user, I want to search inside artifact content so I can find things across all my cards
- As a user, I want to execute JS/TS/sh artifacts directly so I can run automation from my kanban board
- As a user, I want to view and manage artifacts from the web UI so I'm not limited to the CLI

## Requirements

### Data Model
- New `artifacts` table with columns: `id` (TEXT PK, nanoid), `board_id` (TEXT FK NOT NULL → boards), `card_id` (TEXT FK NULL → cards, null for board-level), `filename` (TEXT NOT NULL), `filetype` (TEXT NOT NULL, one of: "md", "html", "js", "ts", "sh"), `content` (TEXT NOT NULL), `position` (INTEGER NOT NULL), `user_id` (TEXT FK NULL → users), `created_at` (TEXT NOT NULL), `updated_at` (TEXT NOT NULL)
- Content stored directly in SQLite TEXT column (max 100KB enforced at CLI and API layer)
- UNIQUE constraint on `(card_id, filename)` for card artifacts and `(board_id, filename)` for board-level artifacts where `card_id IS NULL`
- CASCADE DELETE from cards, boards
- Position is gap-less sequential per parent (same pattern as cards/columns/labels)

### CLI Commands

**List artifacts:**
```
takt artifact list <cardId|boardId>
takt artifact list <boardId> --board
```
- Detects whether the ID is a card or board and lists accordingly
- `--board` flag forces board-level interpretation when ambiguous
- Output columns: ID, Filename, Type, Size (human-readable), Created
- Respects `--json`, `--quiet`, `--full-ids`

**Add artifact:**
```
takt artifact add <cardId> --file <path>
takt artifact add <cardId> --filename <name> --content <text>
takt artifact add <boardId> --board --file <path>
takt artifact add <boardId> --board --filename <name> --content <text>
```
- `--file <path>`: reads file from filesystem, derives filename and filetype from path
- `--filename` + `--content`: creates artifact from inline text, filetype derived from extension
- Filetype must be one of: md, html, js, ts, sh — reject others with clear error
- Content must be non-empty and ≤ 100KB
- Filename must be unique within parent (card or board-level)
- Creates activity entry: action "artifact_added", detail `{"filename": "...", "filetype": "..."}`
- Returns artifact with ID

**Show artifact:**
```
takt artifact show <id>
```
- Displays metadata header (filename, type, size, created, creator)
- Displays full content below the header
- For markdown: render with basic terminal formatting (headers as bold/underline, lists preserved, code blocks indented)
- For code files (js, ts, sh): display raw content with line numbers
- For HTML: display raw source
- Respects `--json` (returns content as string field)

**Edit artifact:**
```
takt artifact edit <id>
takt artifact edit <id> --content <text>
```
- Without `--content`: writes content to a temp file with correct extension, opens `$EDITOR` (falls back to `vi`), reads back on editor close, updates if changed
- With `--content`: direct inline replacement
- Updates `updated_at` timestamp
- Creates activity entry: action "artifact_edited", detail `{"filename": "..."}`
- Validates content is non-empty and ≤ 100KB after edit

**Delete artifact:**
```
takt artifact delete <id> [--yes]
```
- Requires confirmation unless `--yes`
- Creates activity entry: action "artifact_deleted", detail `{"filename": "...", "filetype": "..."}`
- Adjusts positions of remaining sibling artifacts

**Export artifact:**
```
takt artifact export <id> [--output <path>]
```
- Without `--output`: writes to `./<filename>` in current directory
- With `--output`: writes to specified path (creates parent dirs if needed)
- Errors if target file exists (no silent overwrite)
- Prints the written path on success

**Run artifact:**
```
takt artifact run <id> [--yes] [-- args...]
```
- Only for filetype "sh", "js", "ts" — error for md/html with clear message
- Requires confirmation unless `--yes`: shows filename, type, size, first 5 lines of content
- For .sh: writes to temp file, `chmod +x`, executes with `Bun.$`
- For .js/.ts: writes to temp file, executes with `bun run <tmpfile>`
- Arguments after `--` are passed to the script
- Streams stdout/stderr to terminal
- Reports exit code on completion
- Cleans up temp file after execution
- Creates activity entry: action "artifact_run", detail `{"filename": "...", "exit_code": N}`

### API Endpoints

All artifact endpoints require JWT auth and board membership verification.

**Card artifacts:**
- `GET /api/boards/:boardId/cards/:cardId/artifacts` — list card artifacts (returns array sorted by position)
- `POST /api/boards/:boardId/cards/:cardId/artifacts` — create artifact. Body: `{ filename, filetype, content }`. Validates filetype, uniqueness, size. Returns created artifact.
- `GET /api/boards/:boardId/artifacts/:id` — get single artifact with full content
- `PATCH /api/boards/:boardId/artifacts/:id` — update artifact. Body: `{ content?, filename? }`. Updates `updated_at`. Returns updated artifact.
- `DELETE /api/boards/:boardId/artifacts/:id` — delete artifact, adjusts sibling positions

**Board-level artifacts:**
- `GET /api/boards/:boardId/artifacts?scope=board` — list board-level artifacts (card_id IS NULL)
- `POST /api/boards/:boardId/artifacts` — create board-level artifact. Body: `{ filename, filetype, content }`. Same validation as card artifacts.

**Shared:**
- All mutation endpoints create activity entries (same actions as CLI)
- All endpoints return 400 for validation errors with `{ error: "message" }` shape
- All endpoints return 404 if artifact/card/board not found
- Content size validated at API layer (reject > 100KB with 413)

**Card detail integration:**
- `GET /api/boards/:boardId/cards/:cardId` (existing endpoint) — include `artifacts` array in response (id, filename, filetype, position, created_at, updated_at — no content, to keep response light)

### UI Requirements

**CardModal — Artifacts Tab/Section:**
- Add an "Artifacts" section in the CardModal (below checklist, above timeline)
- Show artifact list as rows: filename (with filetype icon/badge), size, created date
- Click an artifact to expand/view its content in a panel below the list
- "Add Artifact" button opens a form: filename input, filetype dropdown (md/html/js/ts/sh), textarea for content
- Each artifact row has Edit and Delete action buttons
- Edit opens the textarea pre-filled with content; save sends PATCH
- Delete shows confirmation dialog, then sends DELETE
- Empty state: subtle "No artifacts" text with "Add Artifact" button

**BoardView — Board Artifacts:**
- Add a "Board Docs" button/icon in the board header area
- Clicking it opens a panel/modal listing board-level artifacts
- Same add/edit/delete/view interactions as card artifacts
- Only shown if user is board member

**Artifact Content Display:**
- Content displayed in a `<pre>` or monospace container
- For markdown files: render as formatted HTML (use a lightweight markdown renderer or just display raw in monospace)
- For code files: monospace with the filetype shown as a badge
- Textarea for editing uses monospace font, auto-resizes to content

**Artifact Viewer States:**
- Default: artifact list (collapsed content)
- Expanded: single artifact content visible below the list
- Editing: textarea replaces the content display
- Adding: form at top of section with filename + filetype + content fields

### Integration with Existing Features

**`takt card show <id>` (CLI):**
- Add "Artifacts" section between checklist and timeline
- Table format: ID, Filename, Type, Size
- If no artifacts, section is omitted

**`takt board show <id>` (CLI):**
- Add "Board Artifacts" section after columns/cards summary
- Same table format as card artifacts
- If no board-level artifacts, section is omitted

**`takt search <boardId> <query>` (CLI + API):**
- Extend search to include artifact content and filenames (case-insensitive LIKE)
- Search results that match on artifact content show: card ID, card title, artifact filename, match context

**Activity tracking:**
- All artifact mutations (add, edit, delete, run) create activity entries
- Board-level artifact mutations create activity with `card_id = NULL`
- Activity actions: "artifact_added", "artifact_edited", "artifact_deleted", "artifact_run"
- Detail field stores JSON with relevant context (filename, filetype, exit_code for runs)
- Artifact activity appears in card timeline (UI + CLI) and board activity feed

## Tech Stack
- Runtime: Bun
- Database: bun:sqlite (new artifacts table via migration in db.ts)
- Backend: Hono (new artifact routes added to existing server)
- Frontend: React 19 (new components integrated into existing CardModal and BoardView)
- CLI: manual argv parsing (new cli-artifact.ts, consistent with existing cli-*.ts pattern)
- Editor integration: `$EDITOR` env var, temp files via `Bun.file()` / `Bun.write()`
- Script execution: `Bun.$` for shell, `bun run` for JS/TS
- Output: aligned text tables with ANSI colors (existing cli-utils patterns)
- Styling: CSS file (consistent with existing ui styles)

## Edge Cases
- **File import of unsupported type**: reject with error listing supported types (md, html, js, ts, sh)
- **Content exceeds 100KB**: reject with "Content exceeds 100KB limit (got Xkb)" — both CLI and API
- **Duplicate filename on same card/board**: reject with "Artifact 'filename' already exists on this card/board"
- **$EDITOR not set and vi not available**: fall back gracefully, suggest `--content` flag
- **Edit with $EDITOR but content unchanged**: skip update, print "No changes made"
- **Export target file exists**: error with "File already exists: <path>. Delete it first or use --output with a different path"
- **Run artifact with non-zero exit code**: print exit code, still log activity, do not treat as CLI error
- **Delete card/board with artifacts**: CASCADE handles cleanup, no extra logic needed
- **Card ID vs Board ID ambiguity in `artifact list`**: try card first, then board. `--board` flag forces board interpretation
- **Empty content on add/edit**: reject with "Artifact content cannot be empty"
- **Filename without extension**: reject with "Filename must have a supported extension (.md, .html, .js, .ts, .sh)"
- **API content size**: return HTTP 413 for oversized content
- **UI textarea paste of large content**: validate size client-side before submission, show warning

## Out of Scope
- Column-level templates / auto-clone on card move (v2)
- Binary file attachments (images, PDFs, archives)
- Artifact versioning / diff history
- Inline artifact preview in `card show` CLI output (content only via `artifact show`)
- Artifact comments or reactions (use card comments for discussion)
- Artifact-to-artifact linking or dependencies
- Remote file URLs as artifact source
- Collaborative editing / conflict resolution
- Syntax highlighting with color themes (monospace display for code)
- Rich markdown editor in UI (basic textarea only)
- Drag-and-drop file upload in UI
- Artifact run from UI (CLI-only feature — security boundary)
