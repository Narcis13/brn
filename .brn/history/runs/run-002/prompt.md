# Complete Event Bus Integration in routes.ts

## Context
The event bus foundation is implemented with typed events and an activity logging subscriber. The integration into routes.ts has been started but needs completion. There are uncommitted changes showing the beginning of event emissions.

## Current State
- Event bus module exists at `src/events/index.ts` with `on()` and `emit()` methods
- Activity logging subscriber refactored at `src/events/subscribers/activity.ts`
- TaktEvent interface and EventTypes defined
- Partial integration in routes.ts with some board events started

## Task
Complete the integration of event emissions throughout all mutations in routes.ts to finish AC1.

## Requirements
1. Add event emissions for ALL mutation operations in routes.ts:
   - Board operations: create, update, delete
   - Card operations: create, update, move, delete
   - Tag operations: create, update, delete
   - User operations: update
   - AI operations: generate, complete

2. Each event must include:
   - `type`: Using the EventTypes enum pattern (e.g., 'board.created')
   - `timestamp`: ISO string
   - `metadata`: Relevant data about the mutation
   - `userId`: From the session

3. Ensure consistency:
   - Emit events AFTER successful mutations
   - Include relevant IDs and data in metadata
   - Use consistent event type naming

4. The activity subscriber should automatically log all these events

## Verification
After implementation:
1. Run `bun test` to ensure all tests pass
2. Run `tsc --noEmit` to verify TypeScript types
3. Manually test that activity logs are being created for mutations

## Important
- Do NOT expand scope beyond completing the event emissions in routes.ts
- Do NOT create new files or refactor existing structure
- Focus only on adding the missing event emissions to complete AC1
- Preserve all existing functionality