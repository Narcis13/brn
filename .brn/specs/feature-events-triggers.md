---
title: Events System & Triggers — Real-time event bus with user-configurable automations
status: ready
priority: high
---

## What
A publish-subscribe event bus that fires typed events for every meaningful mutation in Takt. Users configure board-scoped triggers that react to events with actions: webhooks, artifact execution, in-app notifications, and card automation. Real-time SSE streams push events to the UI for live board updates and a notification bell.

## Why
Takt currently logs activity as a read-only historical record with zero side effects. The events system transforms Takt from a passive board into a reactive platform — watchers get notified, boards update in real-time, artifacts auto-execute on card transitions, and external services receive webhooks. This is the foundation for all future automation and integration capabilities.

## User Stories
- As a board member, I want to receive in-app notifications when cards I'm watching change so I stay informed without polling
- As a board owner, I want to create triggers that fire webhooks when cards move to specific columns so external systems stay in sync
- As a power user, I want triggers that auto-execute board artifacts when events occur so I can build custom automations
- As a team member, I want the board UI to update in real-time when others make changes so I always see the current state
- As a board owner, I want to see a log of trigger executions so I can debug automations when they fail
- As a CLI user, I want to manage triggers and notifications from the command line

## Requirements

### Event Bus (Internal)
- Every mutation in routes.ts emits a typed `TaktEvent` after the DB write succeeds
- Event types follow `entity.action` naming: `board.created`, `board.deleted`, `board.member_invited`, `board.member_removed`, `column.created`, `column.updated`, `column.deleted`, `column.reordered`, `card.created`, `card.updated`, `card.moved`, `card.deleted`, `card.dates_changed`, `card.watched`, `card.unwatched`, `label.created`, `label.updated`, `label.deleted`, `card.label_assigned`, `card.label_removed`, `comment.created`, `comment.updated`, `comment.deleted`, `reaction.toggled`, `artifact.created`, `artifact.updated`, `artifact.deleted`, `artifact.executed`, `checklist.item_added`, `checklist.item_checked`, `checklist.item_unchecked`, `checklist.item_removed`
- Each event carries: `{ eventType: string, boardId: string, cardId: string | null, userId: string, timestamp: string, payload: Record<string, unknown> }`
- Payload contains entity-specific context (e.g., `card.moved` payload: `{ cardId, cardTitle, fromColumn, toColumn, fromPosition, toPosition }`)
- Subscribers register via `eventBus.on(eventType, handler)` with wildcard support (`card.*` matches all card events)
- Refactor existing inline activity creation in routes.ts into an event subscriber — activity logging becomes the first built-in subscriber
- Event bus is synchronous in-process (no external message queue)

### Trigger Engine
- `triggers` table: `id` (TEXT PK), `board_id` (FK), `name` (TEXT, max 100 chars), `event_types` (TEXT, JSON array of event type strings, supports wildcards like `card.*`), `conditions` (TEXT, JSON — optional filters), `action_type` (TEXT enum: `webhook`, `run_artifact`, `notify`, `auto_action`), `action_config` (TEXT, JSON — action-specific configuration), `enabled` (INTEGER, 0/1, default 1), `created_at` (TEXT, ISO 8601), `user_id` (TEXT FK)
- Conditions use simple matching: `{ column?: string, label?: string }` — column matches by column title, label matches by label name. Both are optional. When set, the event must match for the trigger to fire. Column condition applies to card events only (matches the card's current or target column). Label condition applies to card events (matches if card has the label).
- Trigger actions execute asynchronously (non-blocking to the original mutation response)
- `trigger_log` table: `id` (TEXT PK), `trigger_id` (FK), `board_id` (FK), `event_type` (TEXT), `event_payload` (TEXT, JSON), `result` (TEXT: `success` | `error`), `error_message` (TEXT, nullable), `duration_ms` (INTEGER), `executed_at` (TEXT, ISO 8601)
- Trigger log entries auto-prune: keep last 500 per board

### Action Types

**Webhook** (`action_type: 'webhook'`):
- `action_config: { url: string, headers?: Record<string, string> }`
- POST request with JSON body: `{ event: TaktEvent, trigger: { id, name } }`
- Timeout: 10 seconds
- 1 retry after 5 seconds on failure (5xx or timeout)
- Both success and failure logged to trigger_log

**Run Artifact** (`action_type: 'run_artifact'`):
- `action_config: { artifactId: string }`
- Executes a board-level artifact (sh/js/ts only) using existing artifact run infrastructure
- Event data passed as `TAKT_EVENT` environment variable (JSON string)
- Artifact must exist and be board-level (not card-level) — trigger skips with error log if artifact missing
- Execution output captured in trigger_log error_message field (truncated to 5000 chars)

**Notify** (`action_type: 'notify'`):
- `action_config: { target: 'watchers' | 'members' | 'owner' }`
- Creates notification entries for the targeted users (excluding the actor who triggered the event)
- `watchers`: card watchers (only for card-scoped events)
- `members`: all board members
- `owner`: board owner only

**Auto Action** (`action_type: 'auto_action'`):
- `action_config: { action: 'move_card', targetColumn: string } | { action: 'assign_label', labelName: string } | { action: 'remove_label', labelName: string }`
- `move_card`: moves the card to the named column (appends at end position)
- `assign_label` / `remove_label`: adds or removes the named label from the card
- Only applies to card-scoped events — skips silently for non-card events
- Guards against infinite loops: auto_action events do NOT trigger other triggers

### Notification System
- `notifications` table: `id` (TEXT PK), `board_id` (FK), `user_id` (FK), `event_type` (TEXT), `card_id` (TEXT, nullable), `title` (TEXT, max 200 chars), `body` (TEXT, max 500 chars), `read` (INTEGER, 0/1, default 0), `created_at` (TEXT, ISO 8601)
- Built-in notification subscriber: auto-notify card watchers on `card.moved`, `card.updated`, `card.dates_changed`, `comment.created`, `artifact.created`, `artifact.updated` (excludes the actor)
- API endpoints:
  - `GET /api/notifications` — list notifications for authenticated user, sorted by created_at desc, paginated (limit/offset), filterable by `?board_id=<id>&unread=true`
  - `PATCH /api/notifications/:id/read` — mark single notification as read
  - `POST /api/notifications/read-all` — mark all notifications as read, optionally scoped by `{ boardId? }`
  - `GET /api/notifications/count` — returns `{ unread: number }` for badge display
  - `DELETE /api/notifications` — delete all read notifications older than 30 days for the user

### SSE Real-Time Stream
- `GET /api/boards/:boardId/events` — SSE endpoint, requires auth
- Streams all board events in real-time to connected clients
- Event format: `event: <eventType>\ndata: <JSON payload>\n\n`
- Also streams `notification.created` events for the connected user
- Hono's built-in `streamSSE` helper used for implementation
- Clients reconnect automatically (SSE spec built-in behavior)
- Connection scoped to board membership — only board members can subscribe
- Include `trigger.executed` events in the stream (so UI can show trigger activity)

### Trigger API Endpoints
- `GET /api/boards/:boardId/triggers` — list all triggers for a board
- `POST /api/boards/:boardId/triggers` — create trigger: `{ name, event_types: string[], conditions?: { column?: string, label?: string }, action_type, action_config, enabled?: boolean }`
- `PATCH /api/boards/:boardId/triggers/:id` — update trigger fields
- `DELETE /api/boards/:boardId/triggers/:id` — delete trigger
- `POST /api/boards/:boardId/triggers/:id/test` — fire a synthetic event matching the trigger's event_types[0] to test the action
- `GET /api/boards/:boardId/triggers/:id/log` — list trigger execution log (paginated, newest first)
- `GET /api/boards/:boardId/triggers/log` — list all trigger logs for the board (paginated, newest first)

### CLI Commands
- `takt trigger list` — list triggers for the current/specified board
- `takt trigger create` — interactive prompt: name → event types → conditions → action type → action config
- `takt trigger show <id>` — show trigger details + recent log entries
- `takt trigger update <id>` — update trigger fields (flags: --name, --enabled, --event-types)
- `takt trigger delete <id>` — delete a trigger
- `takt trigger log [--trigger <id>]` — show trigger execution log
- `takt trigger test <id>` — fire a test event against the trigger
- `takt notification list [--board <id>] [--unread]` — list notifications
- `takt notification read [<id> | --all]` — mark notifications as read
- `takt notification count` — show unread count

### UI Requirements

**Notification Bell (Board Header):**
- Bell icon in board header with unread count badge (red dot with number, hidden when 0)
- Click opens notification dropdown panel
- Dropdown shows last 20 notifications, newest first
- Each notification: icon by event type, title, relative timestamp, card link if applicable
- Click notification → marks as read + navigates to relevant card
- "Mark all read" button at top of dropdown
- SSE-powered: new notifications appear instantly without refresh

**Triggers Management (Board Settings):**
- "Triggers" tab in a board settings/config panel (new panel, gear icon in board header)
- Trigger list: name, event types (as chips/tags), action type icon, enabled toggle, last fired timestamp
- "New Trigger" button opens trigger builder:
  - Step 1: Name the trigger + select event types (multi-select grouped by entity: Card events, Column events, Comment events, etc.)
  - Step 2: Optional conditions (column dropdown, label dropdown — populated from board's columns/labels)
  - Step 3: Action type selection + configuration form per type:
    - Webhook: URL input + optional headers key-value pairs
    - Run Artifact: dropdown of board-level executable artifacts
    - Notify: radio group (watchers / members / owner)
    - Auto Action: action dropdown (move card / assign label / remove label) + target selector
  - Step 4: Review & save
- Trigger detail view: configuration summary + execution log table (timestamp, event, result, duration)
- Delete trigger with confirmation

**Real-Time Board Updates:**
- SSE connection established when board view loads
- Card movements, creations, deletions by other users reflected immediately
- Column changes (add, rename, delete, reorder) reflected immediately
- Visual indicator when board is receiving live updates (subtle pulse or "Live" badge)
- Graceful degradation: if SSE connection drops, show "Reconnecting..." indicator and fall back to periodic polling until reconnected

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono (existing)
- Database: bun:sqlite (existing)
- Frontend: React 19 (existing)
- Real-time: SSE via Hono `streamSSE`
- HTTP client for webhooks: native `fetch`
- Styling: CSS file (existing pattern)

## Edge Cases
- **Infinite loop prevention**: Events emitted by auto_action triggers do NOT trigger other triggers. The event bus marks them with `_automated: true` and the trigger engine skips automated events.
- **Deleted artifact reference**: If a trigger references an artifact that's been deleted, log an error to trigger_log and skip execution. Don't delete the trigger automatically.
- **Webhook target down**: After 1 retry, log failure. Don't disable the trigger — next event tries again fresh.
- **SSE connection limit**: Cap at 10 concurrent SSE connections per board to prevent resource exhaustion.
- **Actor exclusion**: Notifications never sent to the user who caused the event. Card watcher auto-notification skips the commenter/mover.
- **Column/label renamed**: Trigger conditions match by name at evaluation time, not by ID. If a column is renamed, existing triggers with column conditions need manual update. This is acceptable for v1 simple matching.
- **Board deleted**: CASCADE deletes triggers, trigger_log, and notifications for that board.
- **Concurrent triggers**: Multiple triggers matching the same event all fire independently. Order is not guaranteed.
- **Large event payloads**: Webhook payloads and trigger_log event_payload capped at 10KB JSON.

## Out of Scope
- Email, SMS, or Slack notifications (covered indirectly via webhook triggers)
- Card-level triggers (board-scoped only; card-specific filtering via conditions)
- JSON path expression conditions / complex filter engine (v2)
- Scheduled/cron triggers (only event-driven triggers)
- Trigger templates or marketplace
- Event replay / event sourcing
- Cross-board triggers (each trigger scoped to one board)
- Rate limiting on triggers (v2 — add if webhook abuse becomes a concern)
- Trigger import/export
- WebSocket (SSE sufficient for server→client push)
