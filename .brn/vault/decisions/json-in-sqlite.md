# JSON Storage in SQLite TEXT Columns

## Choice
Store structured data like checklists as JSON in TEXT columns rather than creating separate tables.

## Alternatives Considered
1. Separate checklist_items table with foreign key to cards
2. Native SQLite JSON support (requires newer SQLite version)
3. Serialized format other than JSON

## Rationale
- **Simplicity**: No need for complex joins to fetch card data
- **Flexibility**: Easy to add/remove checklist properties without schema changes  
- **Performance**: Checklist data always fetched with card, no N+1 queries
- **Compatibility**: Works with all SQLite versions
- **Tooling**: JSON is universally supported in JavaScript/TypeScript

## Trade-offs
- Can't query individual checklist items via SQL
- No database-level constraints on JSON structure
- Slightly larger storage than normalized tables

## Confidence
verified