---
title: Takt CLI — Rename app to Takt and add a full CLI alongside the web API
status: active
priority: high
---

## What
Rename the demo application from "Mini Trello" to "Takt", restructure `trello/` to `src/`, and introduce a CLI entry point (`takt`) that provides `takt serve` to run the web server and `takt <resource> <action> --flags` commands for every existing functionality. The CLI accesses SQLite directly — every command works standalone without the server running. The package should be globally installable via `bun link`.

Note: "BRN" (Build Right Now) is the autonomous coding system (`.brn/`, CLAUDE.md, vault, specs) — it remains unchanged. "Takt" is the demo app that showcases BRN's capabilities. This rename only affects the application code, not the BRN tooling.

## Why
Takt is a demo app showcasing what BRN (and Claude Code with a thin orchestration layer) can build autonomously. The app needs its own identity separate from the BRN system. A CLI makes all features scriptable and terminal-accessible — every `takt` command works on its own without needing `takt serve` running, since all commands access the SQLite database directly.

## User Stories
- As a user, I want to run `takt serve` to start the web UI and API server
- As a user, I want to manage boards, cards, columns, labels, and comments from the terminal
- As a user, I want to run `takt auth login` once and have the CLI remember my session
- As a user, I want to install `takt` globally so I can use it from any directory
- As a user, I want `takt board show <id>` to give me a quick text overview of a board without opening a browser

## Requirements

### Rename & Restructure
- Package name in `package.json` changes from `"brn"` to `"takt"`
- `trello/` directory moves to `src/`
- All internal import paths, build scripts, and references update accordingly
- `bun run dev` script becomes `bun run serve` (or just use `takt serve`)
- Console output says "Takt" not "Mini Trello"
- The `.brn/` directory, CLAUDE.md, and orchestration files remain unchanged (they are development tooling, not the app)

### CLI Entry Point
- New file: `src/cli.ts` — the CLI entry point
- `package.json` adds `"bin": { "takt": "./src/cli.ts" }` for global install via `bun link`
- The file starts with `#!/usr/bin/env bun` shebang
- No external CLI framework — use `process.argv` parsing (keep it simple, Bun-native)
- `takt` with no args or `takt --help` prints usage summary with all commands
- `takt --version` prints version from package.json
- Unknown commands print an error message and the help text

### Authentication & Session
- `takt auth register <username> <password>` — creates user in DB, prints confirmation
- `takt auth login <username> <password>` — verifies credentials against DB, stores session in `~/.takt/config.json` as `{ "userId": "<id>", "username": "<name>", "dbPath": "<absolute-path-to-db>" }`
- `takt auth whoami` — prints current logged-in user from config, or "Not logged in"
- `takt auth logout` — removes the session from config
- All commands except `auth register`, `auth login`, `serve`, and `--help/--version` require a valid session — print "Not logged in. Run `takt auth login` first." if missing
- The session config stores the absolute DB path so `takt` works from any directory after `bun link`

### Server Command
- `takt serve [--port <number>]` — builds the UI bundle then starts Bun.serve on the given port (default 3001), exactly what `bun run dev` does today
- Output: "Takt running at http://localhost:<port>"

### Board Commands
- `takt board list` — lists all boards the current user is a member of; columns: ID, Title, Role, Created
- `takt board create <title>` — creates a board, auto-adds user as owner, prints the new board ID
- `takt board show <id>` — prints board title, columns with card counts, member count, total cards
- `takt board delete <id>` — deletes board (owner only), asks for confirmation with `--yes` flag to skip
- `takt board members <id>` — lists members: Username, Role, Invited date
- `takt board invite <id> <username>` — invites user as member (owner only)
- `takt board kick <id> <username>` — removes member (owner only, can't kick self)
- `takt board activity <id> [--limit <n>]` — shows recent activity feed, default 20 items

### Column Commands
- `takt column list <boardId>` — lists columns in position order: ID, Title, Position, Card count
- `takt column create <boardId> <title>` — creates column at the end, prints ID
- `takt column update <id> --title <title>` — renames column
- `takt column delete <id>` — deletes column and its cards, confirms unless `--yes`
- `takt column reorder <boardId> <id1,id2,...>` — sets column order from comma-separated IDs

### Card Commands
- `takt card list <boardId> [--column <id>]` — lists cards; columns: ID, Title, Column, Due Date, Labels
- `takt card create <boardId> --column <id> --title <title> [--description <text>] [--due <date>] [--start <date>]` — creates card, prints ID
- `takt card show <id>` — prints full card detail: title, description, column, dates, checklist progress, labels, recent timeline (last 10 items)
- `takt card update <id> [--title <t>] [--description <t>] [--due <date>] [--start <date>] [--column <id>] [--position <n>] [--checklist <json>] [--add-check <text>] [--toggle-check <index>] [--remove-check <index>]` — updates any combination of fields; checklist helpers: `--add-check` appends an item, `--toggle-check` toggles done/undone at index, `--remove-check` removes at index
- `takt card delete <id>` — deletes card, confirms unless `--yes`
- `takt card move <id> --column <id> [--position <n>]` — shorthand for moving a card

### Label Commands
- `takt label list <boardId>` — lists labels: ID, Name, Color
- `takt label create <boardId> --name <name> --color <color>` — creates label, prints ID
- `takt label update <id> [--name <n>] [--color <c>]` — updates label
- `takt label delete <id>` — deletes label
- `takt label assign <cardId> <labelId>` — assigns label to card
- `takt label unassign <cardId> <labelId>` — removes label from card

### Comment Commands
- `takt comment add <cardId> <content>` — adds comment as current user, auto-watches card, prints ID
- `takt comment edit <id> <content>` — edits own comment
- `takt comment delete <id>` — deletes own comment

### Search Command
- `takt search <boardId> <query>` — searches cards by title/description/labels, prints matching cards with column info

### Output Formatting
- All list commands output as aligned text tables (no external dependency — just padded columns)
- IDs are shown truncated to 8 chars with `...` unless `--full-ids` is passed
- Dates formatted as `YYYY-MM-DD`
- Colors in terminal output (green for success, red for errors, yellow for warnings, cyan for IDs) using ANSI escape codes directly
- `--json` flag on any command outputs raw JSON instead of formatted text
- `--quiet` flag suppresses non-essential output (just the data, no decorations)

### DB Path Resolution
- When running from the project directory: use `./data/kanban.db` (relative, like today)
- When running globally after `bun link`: use the path stored in `~/.takt/config.json` from `takt auth login`
- `takt serve` always uses the local project's DB (resolved from `import.meta.dir`)
- If no DB path can be resolved, print a clear error: "No database found. Run `takt serve` from the project directory or `takt auth login` to set a DB path."

## Tech Stack
- Runtime: Bun
- CLI parsing: manual `process.argv` (no framework — Commander/yargs are overkill for this)
- HTTP server: Hono (unchanged, for `takt serve`)
- Database: bun:sqlite (unchanged, CLI accesses directly)
- Frontend: React (unchanged, for web UI)
- Build: Bun bundler (unchanged)
- Styling: CSS files (unchanged)

## Edge Cases
- `takt auth login` with wrong credentials: print "Invalid username or password" and exit 1
- `takt board delete` on non-owned board: print "Only the board owner can delete this board" and exit 1
- `takt card update --due invalid-date`: print "Invalid date format. Use YYYY-MM-DD" and exit 1
- `takt card update --toggle-check 99` on a card with 3 items: print "Checklist index out of range (0-2)" and exit 1
- `takt comment edit <id>` on someone else's comment: print "You can only edit your own comments" and exit 1
- Running any command with no DB: clear error message pointing to `takt auth login` or running from project dir
- `takt board invite` with non-existent username: print "User not found" and exit 1
- `takt serve` when port is in use: let Bun's native error bubble up (it's already clear)
- `~/.takt/config.json` missing or corrupted: treat as "not logged in"
- `--yes` flag skips confirmation prompts on destructive operations (delete board, delete column, delete card)

## Out of Scope
- Watch/unwatch from CLI (minor feature, add later if needed)
- Reaction toggle from CLI (emoji rendering in terminals is unreliable)
- Interactive/TUI mode (e.g., arrow-key navigation of boards) — CLI is non-interactive
- Shell completions (bash/zsh/fish) — nice-to-have for a future spec
- `takt init` to create a new project — this is a single-project tool for now
- Multi-database support (connecting to different project databases) — future enhancement
- Calendar view in CLI — the web UI handles visual views
- Real-time features (WebSocket) in CLI
- Migration tooling (`takt db migrate`) — migrations run automatically
