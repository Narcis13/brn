# Slice S02 User Acceptance Tests: Board Management

## Prerequisites

1. Ensure the API server is running:
```bash
cd playground
bun run dev
```

2. Set up test user credentials:
```bash
# Register a test user (if not already done)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'

# Login and save the token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}' \
  | jq -r '.token')

echo "Token saved: $TOKEN"
```

## Test 1: Create a Board

### Test Case: Create a board with valid name
```bash
curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "My Project Board"}'
```

**Expected Response:**
- Status: 201 Created
- Response includes: id (UUID), name, user_id, created_at, updated_at

### Test Case: Attempt to create board without authentication
```bash
curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"name": "Unauthorized Board"}'
```

**Expected Response:**
- Status: 401 Unauthorized

### Test Case: Attempt to create board with invalid name
```bash
curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": ""}'
```

**Expected Response:**
- Status: 400 Bad Request
- Error message about invalid board name

## Test 2: List User's Boards

### Test Case: Get all boards for authenticated user
```bash
curl -X GET http://localhost:3000/api/boards \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 200 OK
- Array of boards created by the user
- Each board contains: id, name, user_id, created_at, updated_at

### Test Case: Attempt to list boards without authentication
```bash
curl -X GET http://localhost:3000/api/boards
```

**Expected Response:**
- Status: 401 Unauthorized

## Test 3: Get Individual Board

First, create a board and save its ID:
```bash
BOARD_ID=$(curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Test Board for GET"}' \
  | jq -r '.id')

echo "Board ID: $BOARD_ID"
```

### Test Case: Get board by ID (owner)
```bash
curl -X GET http://localhost:3000/api/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 200 OK
- Board object with matching ID

### Test Case: Attempt to get non-existent board
```bash
curl -X GET http://localhost:3000/api/boards/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 404 Not Found

### Test Case: Attempt to get another user's board
```bash
# First, create a second user and get their board
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "otheruser", "password": "otherpass123"}'

OTHER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "otheruser", "password": "otherpass123"}' \
  | jq -r '.token')

OTHER_BOARD_ID=$(curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -d '{"name": "Other User Board"}' \
  | jq -r '.id')

# Try to access other user's board
curl -X GET http://localhost:3000/api/boards/$OTHER_BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 404 Not Found (security through obscurity)

## Test 4: Update Board

### Test Case: Update board name
```bash
curl -X PUT http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Updated Board Name"}'
```

**Expected Response:**
- Status: 200 OK
- Updated board object with new name

### Test Case: Attempt to update with invalid name
```bash
curl -X PUT http://localhost:3000/api/boards/$BOARD_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": ""}'
```

**Expected Response:**
- Status: 400 Bad Request
- Error message about invalid board name

### Test Case: Attempt to update another user's board
```bash
curl -X PUT http://localhost:3000/api/boards/$OTHER_BOARD_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Hacked Board"}'
```

**Expected Response:**
- Status: 404 Not Found

## Test 5: Delete Board

### Test Case: Delete owned board
```bash
curl -X DELETE http://localhost:3000/api/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 204 No Content

### Test Case: Verify board is deleted
```bash
curl -X GET http://localhost:3000/api/boards/$BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 404 Not Found

### Test Case: Attempt to delete another user's board
```bash
curl -X DELETE http://localhost:3000/api/boards/$OTHER_BOARD_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
- Status: 404 Not Found

## Test 6: Board Name Validation Edge Cases

### Test Case: Maximum length board name (100 characters)
```bash
LONG_NAME="This is a very long board name that is exactly one hundred characters long including spaces here!!!"
curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\": \"$LONG_NAME\"}"
```

**Expected Response:**
- Status: 201 Created
- Board created successfully

### Test Case: Board name too long (101 characters)
```bash
TOO_LONG_NAME="This is a very long board name that is exactly one hundred characters long including spaces here!!!!"
curl -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\": \"$TOO_LONG_NAME\"}"
```

**Expected Response:**
- Status: 400 Bad Request
- Error about board name being too long

## Automated Test Suite

Run all tests with Bun:
```bash
cd playground
bun test
```

This should show all board-related tests passing:
- Repository tests (board.repo.test.ts)
- Route tests (routes/boards.test.ts)
- Service tests (board.service.test.ts)

## Cleanup

Remove test data:
```bash
# This would require database access or an admin endpoint
# For now, boards will remain in the database
```