# Event Bus Integration Pattern

## Approach
When integrating an event bus into existing mutation endpoints, emit events AFTER successful mutations to ensure consistency.

## Example
```typescript
const result = createCard(db, ...);

// Emit event after successful creation
await eventBus.emit({
  type: EventTypes.CARD_CREATED,
  timestamp: new Date().toISOString(),
  metadata: { cardId: result.id, boardId, title },
  userId
});

return c.json(result);
```

## When to Use
- Adding observability to existing APIs
- Decoupling side effects from main business logic
- Building foundation for triggers/webhooks

## Confidence
verified