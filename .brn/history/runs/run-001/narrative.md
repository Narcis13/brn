# Run 001: Event Bus Foundation

## Context
Starting implementation of the events-triggers feature. The current focus is AC1: implementing the event bus module.

## What Happened
1. Created the core event bus module (`src/src/event-bus.ts`) with:
   - Typed `TaktEvent` interface containing eventType, boardId, cardId, userId, timestamp, and payload
   - `eventBus.on()` method supporting exact and wildcard subscriptions (e.g., `card.*`, `*`)
   - `eventBus.emit()` method that executes all matching handlers asynchronously
   - Unsubscribe functionality and error handling

2. Defined all event types (`src/src/event-types.ts`):
   - Following entity.action naming convention (e.g., `board.created`, `card.moved`)
   - Complete set of event constants for boards, columns, cards, labels, comments, artifacts, etc.
   - Type-safe event payload interfaces for each event type

3. Created activity subscriber (`src/src/activity-subscriber.ts`):
   - Subscribes to relevant events and creates activity entries
   - Maps events to existing activity types (created, moved, edited, etc.)
   - Handles both card-level and board-level activities

4. Added comprehensive tests:
   - Event bus tests covering exact matching, wildcards, async handlers, error handling
   - Activity subscriber tests verifying correct activity creation for each event type
   - All 19 tests passing

## Decisions Made
- Used singleton pattern for event bus to ensure single source of truth
- Made event emission async but wait for all handlers to complete
- Chose to log handler errors but not fail the emission
- Activity subscriber only handles events that currently create activities (not all events)

## Next Steps
- Integrate event emission into routes.ts mutations
- Replace direct createActivity calls with event emissions
- Initialize activity subscriber on server startup
- Complete AC1 by ensuring all mutations emit events