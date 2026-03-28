# Common Workflows

Recipes for multi-step operations that combine several `takt` commands.

## Table of Contents

- [Project Kickoff](#project-kickoff)
- [Sprint Planning from PRD](#sprint-planning-from-prd)
- [Daily Standup Review](#daily-standup-review)
- [Triage Incoming Work](#triage-incoming-work)
- [End-of-Sprint Cleanup](#end-of-sprint-cleanup)
- [Board Migration](#board-migration)
- [BRN Integration](#brn-integration)

---

## Project Kickoff

Full setup from zero to a populated board.

```
1. takt auth whoami                              # verify login
2. takt board create "Project Name"              # create board → get boardId
3. takt column create <boardId> "Backlog"        # create columns in order
4. takt column create <boardId> "To Do"
5. takt column create <boardId> "In Progress"
6. takt column create <boardId> "Review"
7. takt column create <boardId> "Done"
8. takt label create <boardId> --name "Feature" --color "#1f6feb"
9. takt label create <boardId> --name "Bug" --color "#d73a49"
10. takt label create <boardId> --name "Urgent" --color "#ff0000"
11. takt card create <boardId> --column <backlogColId> --title "First task"
```

---

## Sprint Planning from PRD

Convert a list of requirements into cards.

```
1. takt column list <boardId> --json             # get column IDs
2. takt label list <boardId> --json              # get label IDs
3. For each requirement:
   a. takt card create <boardId> --column <sprintBacklogId> --title "..." --description "..." --due YYYY-MM-DD
   b. takt label assign <cardId> <labelId>       # if applicable
   c. takt card update <cardId> --add-check "Sub-task 1"  # if has sub-items
   d. takt card update <cardId> --add-check "Sub-task 2"
4. takt card list <boardId> --column <sprintBacklogId>  # verify sprint backlog
```

---

## Daily Standup Review

Quick overview of board state for standup.

```
1. takt board show <boardId>                     # board summary with column counts
2. takt card list <boardId> --column <inProgressId>  # what's being worked on
3. takt card list <boardId> --json               # get all cards, filter for:
   - cards with due dates today or past (overdue)
   - cards in "Review" column (need attention)
4. takt board activity <boardId> --limit 10      # what changed since yesterday
```

Parse the JSON output to identify:
- **Overdue**: cards where `dueDate < today`
- **Due today**: cards where `dueDate == today`
- **Blocked**: cards with "Blocked" label
- **In review**: cards in the review column

---

## Triage Incoming Work

Process new items in an inbox/backlog column.

```
1. takt card list <boardId> --column <inboxColId> --json  # get inbox items
2. For each item, decide:
   - Priority label → takt label assign <cardId> <labelId>
   - Target column  → takt card move <cardId> --column <targetColId>
   - Due date       → takt card update <cardId> --due YYYY-MM-DD
   - Description    → takt card update <cardId> --description "..."
3. takt card list <boardId> --column <inboxColId>  # verify inbox is empty/triaged
```

---

## End-of-Sprint Cleanup

Wrap up a sprint and prepare for the next one.

```
1. takt card list <boardId> --json               # get all cards
2. Cards in "Done" column:
   - Log as completed (comment with summary if desired)
   - takt comment add <cardId> "Completed in Sprint N"
3. Cards NOT in "Done":
   - Move incomplete items back to sprint backlog:
     takt card move <cardId> --column <backlogColId>
   - Or carry forward to next sprint:
     takt card move <cardId> --column <nextSprintColId>
4. takt board activity <boardId> --limit 50      # full sprint activity log
```

---

## Board Migration

Copy structure from one board to another (e.g., for a new quarter).

```
1. takt column list <sourceBoardId> --json       # get source columns
2. takt label list <sourceBoardId> --json        # get source labels
3. takt board create "New Board Name"            # create target board
4. For each source column:
   takt column create <newBoardId> "<column-title>"
5. For each source label:
   takt label create <newBoardId> --name "<name>" --color "<color>"
6. Optionally migrate open cards:
   For each card not in "Done":
     takt card create <newBoardId> --column <mappedColId> --title "..." --description "..."
```

---

## BRN Integration

Use Takt boards to track BRN feature development alongside the autonomous agent.

### Map BRN specs to cards

When running `/specify` to create a new BRN spec, also create a corresponding Takt card:

```
1. Read the spec's acceptance criteria
2. takt card create <boardId> --column <backlogColId> --title "feat: <feature-name>" --description "<spec summary>"
3. For each acceptance criterion:
   takt card update <cardId> --add-check "AC1: <criterion text>"
4. takt label assign <cardId> <featureLabelId>
```

### Update cards from /status

After running `/status`, sync progress to the card:

```
1. Parse AC progress from .brn/state.json
2. For each met criterion:
   takt card update <cardId> --toggle-check <index>  # mark as checked
3. If feature in progress:
   takt card move <cardId> --column <inProgressColId>
4. If feature done:
   takt card move <cardId> --column <doneColId>
   takt comment add <cardId> "Feature complete. PR created."
```

### Track /nightshift runs

```
1. takt comment add <cardId> "Nightshift started at <time>"
2. After completion:
   takt comment add <cardId> "Nightshift completed: <N> runs, all AC met"
   takt card move <cardId> --column <doneColId>
```
