# Implement Database Tables for Triggers and Trigger Log (AC2)

You are implementing acceptance criteria AC2 for the events-triggers feature. The event bus is already complete and working.

## Current State
- Event bus is fully integrated and emitting typed events for all mutations
- Activity subscriber is working and creating activity records
- No trigger or notification tables exist yet

## Your Task
Implement the database tables required for AC2:

### 1. Add to src/db.ts migrate() function:

#### triggers table
```sql
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_types TEXT NOT NULL,
  conditions TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('webhook', 'run_artifact', 'notify', 'auto_action')),
  action_config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
)
```
- `event_types`: JSON array of event type strings (e.g., ["card.moved", "card.*"])
- `conditions`: JSON object for optional filters (e.g., { "column": "Done", "label": "bug" })
- `action_config`: JSON object with action-specific configuration

#### trigger_log table
```sql
CREATE TABLE IF NOT EXISTS trigger_log (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_payload TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'error')),
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  executed_at TEXT NOT NULL
)
```
- Auto-prune to keep last 500 entries per board

### 2. Add TypeScript interfaces in db.ts:
```typescript
export interface TriggerRow {
  id: string;
  board_id: string;
  name: string;
  event_types: string; // JSON array
  conditions: string | null; // JSON object
  action_type: 'webhook' | 'run_artifact' | 'notify' | 'auto_action';
  action_config: string; // JSON object
  enabled: number; // 0 or 1
  created_at: string;
  user_id: string;
}

export interface TriggerLogRow {
  id: string;
  trigger_id: string;
  board_id: string;
  event_type: string;
  event_payload: string; // JSON
  result: 'success' | 'error';
  error_message: string | null;
  duration_ms: number;
  executed_at: string;
}
```

### 3. Add helper functions for trigger log pruning:
```typescript
export function pruneTriggerLogs(db: Database, boardId: string): void {
  // Keep only the last 500 entries per board
  db.run(`
    DELETE FROM trigger_log 
    WHERE board_id = ? 
    AND id NOT IN (
      SELECT id FROM trigger_log 
      WHERE board_id = ? 
      ORDER BY executed_at DESC 
      LIMIT 500
    )
  `, [boardId, boardId]);
}
```

### 4. Write tests in db.test.ts:
- Test that triggers table is created with correct schema
- Test that trigger_log table is created with correct schema
- Test foreign key constraints work correctly
- Test pruneTriggerLogs() keeps exactly 500 entries and removes older ones

## Implementation Notes
- Follow the existing pattern in db.ts - add tables after the artifacts table
- Use CREATE TABLE IF NOT EXISTS for idempotency
- Ensure foreign key constraints are properly set
- JSON fields are stored as TEXT in SQLite
- enabled field uses INTEGER (0/1) not BOOLEAN
- All timestamps use ISO 8601 format (TEXT)

## Run Tests
After implementation, run:
```bash
bun test db.test.ts
```

Make sure all existing tests still pass and your new tests pass.

## Files to modify:
1. src/db.ts - Add tables, interfaces, and pruning function
2. src/db.test.ts - Add tests for new tables and pruning

Complete this implementation focusing only on AC2. Do not start on triggers functionality or other acceptance criteria.