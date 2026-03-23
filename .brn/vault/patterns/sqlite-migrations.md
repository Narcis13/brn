# SQLite Migration Patterns

## Approach
Use PRAGMA table_info to check if columns exist before adding them, making migrations idempotent.

## Example
```typescript
const cardColumns = db.prepare("PRAGMA table_info(cards)").all() as { name: string }[];
const cardColumnNames = cardColumns.map(c => c.name);

if (!cardColumnNames.includes('due_date')) {
  db.exec("ALTER TABLE cards ADD COLUMN due_date TEXT DEFAULT NULL");
}
```

## When to Use
- Adding new columns to existing tables
- Ensuring migrations can run multiple times safely
- Preserving existing data during schema evolution

## Confidence
verified