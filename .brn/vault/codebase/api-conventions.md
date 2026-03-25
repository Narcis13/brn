# API Conventions

## Frontend-Backend Parameter Mapping
The frontend api.ts module uses TypeScript interfaces with camelCase, but the actual JSON sent to the backend must use snake_case to match database column names.

### Example
```typescript
// Frontend interface (for type safety)
interface Updates {
  due_date?: string | null;
  start_date?: string | null;
}

// Usage in API calls
await api.updateCard(boardId, cardId, { 
  due_date: "2026-03-20",    // Must use snake_case
  start_date: "2026-03-17"   // NOT camelCase
});
```

### Affected Fields
- due_date (not dueDate)
- start_date (not startDate)
- column_id (not columnId)
- board_id (not boardId)

## Confidence
verified