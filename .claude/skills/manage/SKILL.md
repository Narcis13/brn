---
name: manage
description: >-
  Project and task management through the Takt CLI kanban system. Scaffold new projects with
  pre-built board templates (kanban, sprint, GTD, roadmap), create and organize tasks as cards,
  track progress across columns, label and categorize work, manage team collaboration, and
  search across boards. Use when: (1) user says "manage", "scaffold", "set up project",
  "create board", "add task", "track work", "organize tasks", "project status", "move task",
  "sprint planning", (2) user wants to create, list, update, move, or delete boards/cards/columns/labels,
  (3) user asks about project progress or task tracking, (4) user wants to set up a kanban workflow,
  (5) user says "what's on my board", "show tasks", "what's overdue", "search tasks".
  Works with the Takt CLI (`takt` command) which talks directly to SQLite — no server needed.
user-invocable: true
argument-hint: "[setup|board|task|sprint|progress|search|activity|help] [args...]"
---

# /manage — Project & Task Management

Manage projects, tasks, and workflows through the Takt kanban CLI. Route based on the first argument:

| Subcommand | Action |
|------------|--------|
| `setup` | Scaffold a new project board with a template |
| `board` | Board operations (list, show, create, delete, members) |
| `task` | Card/task operations (create, update, move, show, delete) |
| `column` | Column operations (create, reorder, rename, delete) |
| `label` | Label operations (create, assign, unassign, list) |
| `sprint` | Sprint planning — batch-create tasks from a plan |
| `progress` | Show board progress dashboard |
| `search` | Search cards across a board |
| `activity` | Show recent board activity |
| `comment` | Add/edit/delete comments on cards |
| `help` | Show this command reference |
| *(none)* | Auto-detect: show progress if board exists, offer setup if not |

## Prerequisites

Before any operation, verify Takt is available and the user is authenticated:

```bash
takt auth whoami
```

- If `Not logged in` or command not found, see [references/setup-guide.md](references/setup-guide.md) for first-time setup.
- All `takt` commands work without the server running — CLI talks directly to SQLite.

## Argument Routing

Parse `$ARGUMENTS` to determine the subcommand. The first word is the subcommand, remaining words are arguments.

**No arguments**: Run `takt board list --json` to check for existing boards.
- If boards exist: show a progress summary (follow **Progress** workflow)
- If no boards: offer to scaffold a new project (follow **Setup** workflow)

**With arguments**: Route to the matching section below.

---

## Setup — Scaffold a New Project

Trigger: `/manage setup [template] [name]`

Templates provide pre-built column structures. See [references/project-templates.md](references/project-templates.md) for all templates with their columns, labels, and colors.

### Workflow

1. **Parse arguments**: Extract template name and project name from args. If missing, ask.

2. **Select template**: Match against available templates. If no match or not specified, present options:
   - `kanban` — Backlog, To Do, In Progress, Review, Done
   - `sprint` — Sprint Backlog, In Progress, Review, Testing, Done
   - `gtd` — Inbox, Next Actions, Waiting For, Someday/Maybe, Done
   - `roadmap` — Ideas, Planned, In Progress, Shipped
   - `simple` — To Do, Doing, Done
   - `bug-tracker` — Reported, Triaging, In Progress, Fixed, Verified
   - `custom` — Ask user for column names

3. **Create the board**:
   ```bash
   takt board create "<project-name>"
   ```
   Capture the board ID from output.

4. **Create columns** from the template (in order):
   ```bash
   takt column create <boardId> "<column-name>"
   ```
   Repeat for each column in the template.

5. **Create labels** from the template's default label set:
   ```bash
   takt label create <boardId> --name "<name>" --color "<hex>"
   ```
   See [references/project-templates.md](references/project-templates.md) for per-template label sets.

6. **Confirm with summary**:
   ```
   Project "<name>" created with <template> template.
     Board ID: <id>
     Columns:  <list>
     Labels:   <list>

   Next steps:
     /manage task <boardId> --title "First task"
     /manage sprint <boardId>
     /manage progress <boardId>
   ```

---

## Board — Board Operations

Trigger: `/manage board [action] [args]`

| Action | Command |
|--------|---------|
| `list` | `takt board list` |
| `show <id>` | `takt board show <id>` |
| `create <title>` | `takt board create "<title>"` |
| `delete <id>` | `takt board delete <id> --yes` |
| `members <id>` | `takt board members <id>` |
| `invite <id> <user>` | `takt board invite <id> <user>` |
| `kick <id> <user>` | `takt board kick <id> <user>` |

Default action (no args): `takt board list`

Always use `--full-ids` when the user will need IDs for follow-up commands.

---

## Task — Card/Task Operations

Trigger: `/manage task [action] [args]`

### Create a task

```bash
takt card create <boardId> --column <columnId> --title "<title>" [--description "<text>"] [--due <YYYY-MM-DD>] [--start <YYYY-MM-DD>]
```

When creating tasks from natural language, parse the user's intent:
- "add a task to do X by Friday" → extract title + calculate due date from today's date
- "create a bug for the login issue" → title + assign "Bug" label if it exists on the board

### Show a task

```bash
takt card show <cardId>
```

### Update a task

```bash
takt card update <cardId> [--title "..."] [--description "..."] [--due YYYY-MM-DD] [--start YYYY-MM-DD]
```

### Move a task between columns

```bash
takt card move <cardId> --column <columnId> [--position <n>]
```

When the user says "move X to done" or "mark X as done", resolve the column name to ID:
1. Run `takt column list <boardId> --json`
2. Find the column whose title matches (case-insensitive)
3. Execute the move with the resolved column ID

### Checklist operations

```bash
takt card update <cardId> --add-check "<item>"
takt card update <cardId> --toggle-check <index>
takt card update <cardId> --remove-check <index>
```

Indexes are zero-based.

### Delete a task

```bash
takt card delete <cardId> --yes
```

### List tasks

```bash
takt card list <boardId> [--column <columnId>]
```

---

## Column — Column Operations

Trigger: `/manage column [action] [args]`

| Action | Command |
|--------|---------|
| `list <boardId>` | `takt column list <boardId>` |
| `create <boardId> <title>` | `takt column create <boardId> "<title>"` |
| `rename <id> <title>` | `takt column update <id> --title "<title>"` |
| `delete <id>` | `takt column delete <id> --yes` |
| `reorder <boardId> <ids>` | `takt column reorder <boardId> <id1,id2,...>` |

For reorder: all column IDs for the board must be provided in the target order, comma-separated.

---

## Label — Label Operations

Trigger: `/manage label [action] [args]`

| Action | Command |
|--------|---------|
| `list <boardId>` | `takt label list <boardId>` |
| `create <boardId> <name> <color>` | `takt label create <boardId> --name "<name>" --color "<hex>"` |
| `assign <cardId> <labelId>` | `takt label assign <cardId> <labelId>` |
| `unassign <cardId> <labelId>` | `takt label unassign <cardId> <labelId>` |
| `update <id> [--name ...] [--color ...]` | `takt label update <id> ...` |
| `delete <id>` | `takt label delete <id>` |

Colors must be hex format: `#RRGGBB`.

---

## Sprint — Batch Task Creation

Trigger: `/manage sprint <boardId> [args]`

Sprint planning creates multiple cards at once from a structured plan.

### Workflow

1. **Get board context**:
   ```bash
   takt column list <boardId> --json
   takt label list <boardId> --json
   ```

2. **Gather sprint items**: If no items in args, ask the user for a list of tasks. Accept:
   - Bullet-point lists
   - Numbered lists
   - Natural language ("I need to build auth, fix the nav bug, and write API docs")
   - Pasted spec sections or PRD excerpts

3. **Parse and structure**: For each item, derive:
   - `title` — concise task name
   - `description` — expanded detail (if provided)
   - `column` — default to first non-done column (typically "To Do" or "Sprint Backlog")
   - `labels` — match against existing board labels by keyword
   - `due` — if mentioned or inferable
   - `checklist` — if the item has sub-steps

4. **Present the plan** before executing:
   ```
   Sprint plan for "<board-name>":
     1. [Feature] Build user auth — To Do, due 2026-04-01
     2. [Bug]     Fix nav dropdown — To Do
     3. [Docs]    Write API docs  — To Do, due 2026-04-05

   Create these 3 cards? (confirm or adjust)
   ```

5. **Execute**: Create each card with full flags, assign labels where matched:
   ```bash
   takt card create <boardId> --column <colId> --title "..." --description "..." --due YYYY-MM-DD
   takt label assign <cardId> <labelId>
   ```

6. **Report**:
   ```
   Sprint loaded: 3 cards created
     - <card1-id> Build user auth [Feature]
     - <card2-id> Fix nav dropdown [Bug]
     - <card3-id> Write API docs [Docs]
   ```

---

## Progress — Board Dashboard

Trigger: `/manage progress [boardId]`

### Workflow

1. If no boardId, run `takt board list --json` and pick the first/only board, or ask if multiple.

2. Gather data in parallel:
   ```bash
   takt board show <boardId> --json
   takt card list <boardId> --json
   takt column list <boardId> --json
   ```

3. Compute and display:

   ```
   Board: <title>
   ──────────────────────────────────
   | Column        | Cards | %     |
   |---------------|-------|-------|
   | Backlog       |     3 |  20%  |
   | In Progress   |     5 |  33%  |
   | Review        |     2 |  13%  |
   | Done          |     5 |  33%  |
   ──────────────────────────────────
   Total: 15 cards

   Overdue: 2 cards
     - "Fix auth bug" (due 2026-03-20)
     - "Write tests" (due 2026-03-25)

   Due this week: 3 cards
     - "API docs" (due 2026-03-28)
     - "Deploy v2" (due 2026-03-29)
     - "Review PR #42" (due 2026-03-30)

   Recently moved: (last 24h)
     - "Setup CI" → Done
     - "Nav redesign" → Review
   ```

4. Flag overdue items prominently. Use today's date for comparisons.

---

## Search — Find Tasks

Trigger: `/manage search <boardId> <query>`

```bash
takt search <boardId> "<query>" --json
```

Present results as a table with ID, title, column, due date, and labels.

If no boardId provided, resolve from `takt board list --json` (pick first/only or ask).

---

## Activity — Recent Changes

Trigger: `/manage activity [boardId] [--limit N]`

```bash
takt board activity <boardId> [--limit <n>]
```

Default limit: 20. Show as a timeline.

---

## Comment — Card Comments

Trigger: `/manage comment [action] [args]`

| Action | Command |
|--------|---------|
| `add <cardId> <text>` | `takt comment add <cardId> "<text>"` |
| `edit <commentId> <text>` | `takt comment edit <commentId> "<text>"` |
| `delete <commentId>` | `takt comment delete <commentId>` |

---

## Help — Show Reference

Trigger: `/manage help`

Display:

```
/manage                        — Show progress or offer setup
/manage setup [template] [name] — Scaffold a project board
/manage board [action]          — Board CRUD and membership
/manage task [action]           — Create, update, move, delete cards
/manage column [action]         — Column CRUD and reordering
/manage label [action]          — Label CRUD and assignment
/manage sprint <boardId>        — Batch-create tasks from a plan
/manage progress [boardId]      — Progress dashboard
/manage search <boardId> <q>    — Search cards
/manage activity [boardId]      — Recent activity feed
/manage comment [action]        — Card comments

Templates: kanban, sprint, gtd, roadmap, simple, bug-tracker, custom
Global flags: --json, --quiet, --full-ids, --yes
```

---

## Natural Language Handling

When the user's input doesn't match a strict subcommand pattern, interpret intent:

| User says | Route to |
|-----------|----------|
| "set up a project for X" | `setup` |
| "add a task to do X" | `task create` |
| "what's on my board" | `progress` |
| "move X to done" | `task move` |
| "show me overdue tasks" | `progress` (highlight overdue) |
| "create a sprint for these items: ..." | `sprint` |
| "find all tasks about auth" | `search` |
| "delete the board" | `board delete` |
| "add a review column" | `column create` |
| "tag this as urgent" | `label assign` |
| "what happened today" | `activity` |

## ID Resolution

Takt IDs are UUIDs. Users will typically not know IDs. Resolve them contextually:

1. **Board by name**: Run `takt board list --json`, match by title (case-insensitive, partial match OK).
2. **Column by name**: Run `takt column list <boardId> --json`, match by title.
3. **Card by title**: Run `takt card list <boardId> --json`, match by title. If ambiguous, show matches and ask.
4. **Label by name**: Run `takt label list <boardId> --json`, match by name.

Always resolve names to IDs before executing commands. Never ask the user for raw UUIDs.

## Error Handling

- **Not logged in**: Run setup from [references/setup-guide.md](references/setup-guide.md)
- **Board not found**: List boards and suggest the closest match
- **Card not found**: Search by title and suggest matches
- **Permission denied**: Report which operation failed and why (owner-only, author-only)
- **Invalid date**: Remind user of YYYY-MM-DD format and retry
- **Takt not installed**: Guide through `bun install && bun link` from project root
