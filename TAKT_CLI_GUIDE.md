# Takt CLI Guide

This guide covers the `takt` command-line interface in detail: installation, authentication, database/session behavior, global flags, every command, every supported flag, and common workflows.

## Overview

Takt is the CLI and web demo app in this repository. The CLI talks to the SQLite database directly, so most commands work without the server running.

Use it to:

- start the web server with `takt serve`
- manage boards, columns, cards, labels, and comments from the terminal
- search cards across a board
- inspect data quickly without opening the browser

## Installation

From the project root:

```sh
bun install
bun link
```

After `bun link`, the `takt` command should be available globally.

You can also run it directly from the repo:

```sh
bun run src/cli.ts --help
```

## Basic Syntax

```sh
takt <command> [subcommand] [options]
```

Examples:

```sh
takt auth login alice secret123
takt board list
takt column list <boardId>
takt card create <boardId> --column <columnId> --title "Write guide"
takt search <boardId> "release notes"
```

## Database And Session Behavior

Takt resolves the database path like this:

1. If you run `takt` from inside this project, it uses the local database at `data/kanban.db`.
2. If you run `takt` outside the project, it falls back to the saved `dbPath` in `~/.takt/config.json`.

The saved session file looks like this:

```json
{
  "userId": "user-id",
  "username": "alice",
  "dbPath": "/absolute/path/to/data/kanban.db"
}
```

Important behavior:

- Your first `takt auth register` or `takt auth login` should be run from the project directory so Takt can resolve the local database.
- `takt serve` always uses the local project code and database.
- If Takt cannot resolve a database, it prints a clear error and exits.

## Authentication Rules

These commands do not require an existing login:

- `takt auth register`
- `takt auth login`
- `takt auth whoami`
- `takt auth logout`
- `takt serve`
- `takt --help`
- `takt --version`

Most resource commands do require a valid saved session. If you are not logged in, Takt exits with:

```text
Not logged in. Run `takt auth login` first.
```

## Global Flags

These flags apply to resource commands throughout the CLI:

### `--help`, `-h`

Show the CLI help summary.

```sh
takt --help
```

### `--version`, `-v`

Print the version from `package.json`.

```sh
takt --version
```

### `--json`

Print raw JSON instead of formatted terminal output.

```sh
takt board list --json
takt card show <cardId> --json
```

### `--quiet`

Suppress non-essential output. For list-style commands, this usually means minimal data per line instead of headings or tables.

```sh
takt board list --quiet
takt label list <boardId> --quiet
```

### `--full-ids`

Show full IDs instead of the default shortened form.

By default, Takt truncates IDs to the first 8 characters plus `...`.

```sh
takt board list --full-ids
```

### `--yes`, `-y`

Skip confirmation prompts for destructive commands.

Use it with:

- `takt board delete`
- `takt column delete`
- `takt card delete`

```sh
takt card delete <cardId> --yes
```

## Output Conventions

Takt uses a few standard output rules:

- tables for most list commands
- truncated IDs unless `--full-ids` is set
- `YYYY-MM-DD` date formatting for date-only fields
- ANSI colors in terminal output for success, errors, warnings, and IDs
- JSON output when `--json` is used

## Command Reference

### Authentication

#### `takt auth register <username> <password>`

Create a user in the current Takt database.

Example:

```sh
takt auth register alice secret123
```

Notes:

- use this from the project directory on first setup
- usernames must be unique

#### `takt auth login <username> <password>`

Authenticate and save the session to `~/.takt/config.json`.

Example:

```sh
takt auth login alice secret123
```

Behavior:

- validates credentials against the database
- stores `userId`, `username`, and resolved `dbPath`
- enables running `takt` from other directories after login

#### `takt auth whoami`

Show the current logged-in username, or `Not logged in`.

Examples:

```sh
takt auth whoami
takt auth whoami --json
```

#### `takt auth logout`

Clear the saved session.

```sh
takt auth logout
```

### Server

#### `takt serve [--port <number>]`

Build the frontend bundle and start the Takt web server.

Flags:

- `--port <number>`: override the default port `3001`

Examples:

```sh
takt serve
takt serve --port 4000
```

Default behavior:

- builds `src/public/dist`
- starts the app server
- prints `Takt running at http://localhost:<port>`

### Boards

#### `takt board list`

List boards the current user belongs to.

Output columns:

- `ID`
- `Title`
- `Role`
- `Created`

Examples:

```sh
takt board list
takt board list --json
takt board list --quiet
takt board list --full-ids
```

#### `takt board create <title>`

Create a board and automatically add the current user as owner.

Example:

```sh
takt board create "Release Planning"
```

#### `takt board show <id>`

Show a board summary.

Includes:

- board title
- ID
- created date
- member count
- column count
- total card count
- column summaries

Example:

```sh
takt board show <boardId>
```

#### `takt board delete <id> [--yes]`

Delete a board.

Restrictions:

- owner only

Examples:

```sh
takt board delete <boardId>
takt board delete <boardId> --yes
```

#### `takt board members <id>`

List board members.

Output columns:

- `Username`
- `Role`
- `Invited`

Example:

```sh
takt board members <boardId>
```

#### `takt board invite <id> <username>`

Invite a user to the board as a member.

Restrictions:

- owner only

Example:

```sh
takt board invite <boardId> bob
```

#### `takt board kick <id> <username>`

Remove a member from the board.

Restrictions:

- owner only
- you cannot kick yourself
- you cannot remove the owner

Example:

```sh
takt board kick <boardId> bob
```

#### `takt board activity <id> [--limit <n>]`

Show recent board activity aggregated from the board’s cards.

Flags:

- `--limit <n>`: number of activity items to show, default `20`

Example:

```sh
takt board activity <boardId>
takt board activity <boardId> --limit 50
```

### Columns

#### `takt column list <boardId>`

List columns in position order.

Output columns:

- `ID`
- `Title`
- `Position`
- `Card count`

Example:

```sh
takt column list <boardId>
```

#### `takt column create <boardId> <title>`

Create a new column at the end of the board.

Example:

```sh
takt column create <boardId> "Blocked"
```

#### `takt column update <id> --title <title>`

Rename a column.

Flags:

- `--title <title>`: new column title

Example:

```sh
takt column update <columnId> --title "Ready for Review"
```

#### `takt column delete <id> [--yes]`

Delete a column.

Behavior:

- asks for confirmation unless `--yes` is provided
- removing a column also removes its cards through the database relationship

Example:

```sh
takt column delete <columnId>
takt column delete <columnId> --yes
```

#### `takt column reorder <boardId> <id1,id2,...>`

Set the full column order using a comma-separated list of all column IDs in the target board.

Important:

- you must provide every column ID for the board
- the order you provide becomes the new position order

Example:

```sh
takt column reorder <boardId> colA,colB,colC
```

### Cards

#### `takt card list <boardId> [--column <id>]`

List cards in a board, optionally filtered to one column.

Flags:

- `--column <id>`: only show cards from the specified column

Output columns:

- `ID`
- `Title`
- `Column`
- `Due Date`
- `Labels`

Examples:

```sh
takt card list <boardId>
takt card list <boardId> --column <columnId>
takt card list <boardId> --json
```

#### `takt card create <boardId> --column <id> --title <title> [--description <text>] [--due <date>] [--start <date>]`

Create a card in a board.

Required flags:

- `--column <id>`
- `--title <title>`

Optional flags:

- `--description <text>`
- `--due <date>`
- `--start <date>`

Date format:

- `YYYY-MM-DD`

Examples:

```sh
takt card create <boardId> --column <columnId> --title "Write docs"
takt card create <boardId> --column <columnId> --title "Ship CLI" --description "Finalize guide" --start 2026-03-25 --due 2026-03-30
```

#### `takt card show <id>`

Show detailed card information.

Includes:

- title
- ID
- board
- column
- description
- dates
- checklist progress
- labels
- recent timeline entries

Examples:

```sh
takt card show <cardId>
takt card show <cardId> --json
```

#### `takt card update <id> [flags]`

Update one or more fields on a card.

Supported flags:

- `--title <text>`
- `--description <text>`
- `--due <date>`
- `--start <date>`
- `--column <id>`
- `--position <n>`
- `--checklist <json>`
- `--add-check <text>`
- `--toggle-check <index>`
- `--remove-check <index>`

Checklist JSON format:

```json
[
  { "id": "item-1", "text": "Draft", "checked": true },
  { "id": "item-2", "text": "Review", "checked": false }
]
```

Checklist helper notes:

- `--add-check` appends a new unchecked item
- `--toggle-check` flips the checked state at the given index
- `--remove-check` removes the item at the given index
- checklist indexes are zero-based

Position notes:

- `--position` expects an integer
- positions are zero-based

Examples:

```sh
takt card update <cardId> --title "Renamed task"
takt card update <cardId> --due 2026-04-01 --start 2026-03-28
takt card update <cardId> --add-check "Write first draft"
takt card update <cardId> --toggle-check 0
takt card update <cardId> --remove-check 1
takt card update <cardId> --checklist '[{"id":"a","text":"Ship","checked":false}]'
```

#### `takt card delete <id> [--yes]`

Delete a card.

Examples:

```sh
takt card delete <cardId>
takt card delete <cardId> --yes
```

#### `takt card move <id> --column <id> [--position <n>]`

Move a card to another column.

Flags:

- `--column <id>`: target column ID
- `--position <n>`: optional target position in the destination column

Examples:

```sh
takt card move <cardId> --column <columnId>
takt card move <cardId> --column <columnId> --position 0
```

### Labels

#### `takt label list <boardId>`

List labels in a board.

Output columns:

- `ID`
- `Name`
- `Color`

Example:

```sh
takt label list <boardId>
```

#### `takt label create <boardId> --name <name> --color <color>`

Create a label.

Flags:

- `--name <name>`
- `--color <color>`: hex color in `#RRGGBB` format

Example:

```sh
takt label create <boardId> --name "Urgent" --color "#ff0000"
```

#### `takt label update <id> [--name <name>] [--color <color>]`

Update a label.

Flags:

- `--name <name>`
- `--color <color>`

Example:

```sh
takt label update <labelId> --name "Backend" --color "#1f6feb"
```

#### `takt label delete <id>`

Delete a label.

Example:

```sh
takt label delete <labelId>
```

#### `takt label assign <cardId> <labelId>`

Assign a label to a card.

Example:

```sh
takt label assign <cardId> <labelId>
```

#### `takt label unassign <cardId> <labelId>`

Remove a label from a card.

Example:

```sh
takt label unassign <cardId> <labelId>
```

### Comments

#### `takt comment add <cardId> <content>`

Add a comment to a card.

Behavior:

- automatically watches the card for the commenter

Example:

```sh
takt comment add <cardId> "Need final approval before merge"
```

#### `takt comment edit <id> <content>`

Edit one of your own comments.

Restriction:

- comment author only

Example:

```sh
takt comment edit <commentId> "Updated wording"
```

#### `takt comment delete <id>`

Delete one of your own comments.

Restriction:

- comment author only

Example:

```sh
takt comment delete <commentId>
```

### Search

#### `takt search <boardId> <query>`

Search cards in a board.

The search matches:

- card titles
- card descriptions
- label names

Output columns:

- `ID`
- `Title`
- `Column`
- `Due Date`
- `Labels`

Examples:

```sh
takt search <boardId> "release"
takt search <boardId> "backend"
takt search <boardId> "urgent" --json
```

## Common Workflows

### 1. First-Time Setup

```sh
bun install
bun link
takt auth register alice secret123
takt auth login alice secret123
takt auth whoami
```

### 2. Create A Board And Add Work

```sh
takt board create "Q2 Planning"
takt board list
takt column list <boardId>
takt card create <boardId> --column <columnId> --title "Draft roadmap"
takt card list <boardId>
```

### 3. Add Labels And Comments

```sh
takt label create <boardId> --name "Urgent" --color "#ff0000"
takt label list <boardId>
takt label assign <cardId> <labelId>
takt comment add <cardId> "This needs review today"
takt card show <cardId>
```

### 4. Reorder Columns

```sh
takt column list <boardId> --full-ids
takt column reorder <boardId> <firstId>,<secondId>,<thirdId>
```

### 5. Script-Friendly JSON Output

```sh
takt board list --json
takt card show <cardId> --json
takt search <boardId> "release" --json
```

## Error And Validation Notes

Some important validations and restrictions:

- invalid login prints `Invalid username or password`
- missing login for protected commands prints `Not logged in. Run \`takt auth login\` first.`
- board delete is owner-only
- board invite and board kick are owner-only
- comment edit and delete are author-only in the CLI
- `--due` and `--start` must use `YYYY-MM-DD`
- invalid checklist JSON is rejected
- `--toggle-check` and `--remove-check` fail when the index is out of range
- label colors must be valid hex values like `#1f6feb`
- destructive commands should use `--yes` in scripts and CI

## Tips

- quote multi-word titles, descriptions, and comments
- use `--full-ids` when copying IDs between commands
- use `--json` for automation and `--quiet` for shell pipelines
- run `takt auth login` once from the project directory before using the globally linked CLI elsewhere

## Quick Reference

```sh
takt --help
takt --version
takt auth register <username> <password>
takt auth login <username> <password>
takt auth whoami
takt auth logout
takt serve [--port <number>]
takt board list
takt board create <title>
takt board show <id>
takt board delete <id> [--yes]
takt board members <id>
takt board invite <id> <username>
takt board kick <id> <username>
takt board activity <id> [--limit <n>]
takt column list <boardId>
takt column create <boardId> <title>
takt column update <id> --title <title>
takt column delete <id> [--yes]
takt column reorder <boardId> <id1,id2,...>
takt card list <boardId> [--column <id>]
takt card create <boardId> --column <id> --title <title> [--description <text>] [--due <date>] [--start <date>]
takt card show <id>
takt card update <id> [--title <text>] [--description <text>] [--due <date>] [--start <date>] [--column <id>] [--position <n>] [--checklist <json>] [--add-check <text>] [--toggle-check <index>] [--remove-check <index>]
takt card delete <id> [--yes]
takt card move <id> --column <id> [--position <n>]
takt label list <boardId>
takt label create <boardId> --name <name> --color <color>
takt label update <id> [--name <name>] [--color <color>]
takt label delete <id>
takt label assign <cardId> <labelId>
takt label unassign <cardId> <labelId>
takt comment add <cardId> <content>
takt comment edit <id> <content>
takt comment delete <id>
takt search <boardId> <query>
```
