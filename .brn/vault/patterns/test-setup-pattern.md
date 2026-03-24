# Test Setup Pattern for Hono Apps

## Approach
Use the existing test patterns from routes.test.ts rather than creating custom setups. The codebase already has well-established patterns for testing Hono applications.

## Example
```typescript
// Use these helper functions
function req(method: string, path: string, body?: unknown): Request
function authReq(method: string, path: string, token: string, body?: unknown): Request

// Use app.fetch() for making requests
const res = await app.fetch(authReq("GET", `/api/boards/${boardId}/labels`, authToken));

// Use createTestDb from db.ts
db = createTestDb(`${TEST_DIR}/test-${Date.now()}.db`);
```

## When to Use
- Always when writing tests for Hono routes
- Maintains consistency with existing test suite
- Ensures proper request/response handling

## Confidence
verified