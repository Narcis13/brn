---
slice: S03
milestone: M001
status: uat_ready
demo_sentence: User Acceptance Tests for Card Operations
---

# User Acceptance Test Script - S03: Card Operations

This script validates that users can create, read, update, move, and delete cards within their boards.

## Prerequisites

1. Server running on http://localhost:3000
2. User account created and logged in
3. At least one board created

## Setup Test Data

```bash
# Start the server (in a separate terminal)
cd playground
bun run dev

# Create a test user
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cardtest@example.com",
    "password": "testpass123"
  }'

# Login to get auth token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cardtest@example.com", 
    "password": "testpass123"
  }' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Auth token: $TOKEN"

# Create a test board
BOARD_ID=$(curl -X POST http://localhost:3000/api/boards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Board for Cards"}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "Board ID: $BOARD_ID"
```

## Test 1: Create Cards in Different Columns

### Test 1.1: Create a card in TODO column
```bash
CARD1=$(curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Setup development environment\",
    \"description\": \"Install dependencies and configure tools\",
    \"column\": \"todo\"
  }" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "Created card 1 ID: $CARD1"
```

**Expected**: Card created with position 0 in todo column

### Test 1.2: Create a card in DOING column
```bash
CARD2=$(curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Implement user authentication\",
    \"column\": \"doing\"
  }" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "Created card 2 ID: $CARD2"
```

**Expected**: Card created with position 0 in doing column

### Test 1.3: Create a card in DONE column
```bash
CARD3=$(curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Project planning complete\",
    \"description\": \"All requirements gathered and documented\",
    \"column\": \"done\"
  }" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "Created card 3 ID: $CARD3"
```

**Expected**: Card created with position 0 in done column

### Test 1.4: Create multiple cards in same column
```bash
# Add more TODO cards
CARD4=$(curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Write unit tests\",
    \"column\": \"todo\"
  }" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

CARD5=$(curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Design database schema\",
    \"column\": \"todo\"
  }" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo "Created cards 4 and 5"
```

**Expected**: New cards get incrementing positions (1, 2) in todo column

## Test 2: List and Retrieve Cards

### Test 2.1: List all cards for the board
```bash
curl -X GET "http://localhost:3000/api/boards/$BOARD_ID/cards" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Expected**: 
- Returns array of 5 cards
- Cards grouped by column
- Cards within each column sorted by position

### Test 2.2: Get individual card details
```bash
curl -X GET "http://localhost:3000/api/cards/$CARD1" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Expected**: Returns full card details including timestamps

## Test 3: Update Card Content

### Test 3.1: Update card title and description
```bash
curl -X PUT "http://localhost:3000/api/cards/$CARD1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Setup development environment (UPDATED)",
    "description": "Install Node.js, Bun, and configure VS Code"
  }' | jq '.'
```

**Expected**: Card updated with new title and description

### Test 3.2: Move card to different column
```bash
# Move from TODO to DOING
curl -X PUT "http://localhost:3000/api/cards/$CARD1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "column": "doing"
  }' | jq '.'
```

**Expected**: 
- Card moved to doing column
- Position set to end of doing column (position 1)

### Test 3.3: Reorder cards within column
```bash
# Move card to specific position
curl -X PUT "http://localhost:3000/api/cards/$CARD4" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "position": 0
  }' | jq '.'

# Check new order
curl -X GET "http://localhost:3000/api/boards/$BOARD_ID/cards" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.column == "todo") | {title, position}'
```

**Expected**: Card positions adjusted to maintain order

## Test 4: Delete Cards

### Test 4.1: Delete a card
```bash
# Delete the card in position 1 of TODO
curl -X DELETE "http://localhost:3000/api/cards/$CARD5" \
  -H "Authorization: Bearer $TOKEN"

# Verify positions adjusted
curl -X GET "http://localhost:3000/api/boards/$BOARD_ID/cards" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.column == "todo") | {title, position}'
```

**Expected**: 
- Card deleted successfully (204 status)
- Remaining cards' positions adjusted (no gaps)

## Test 5: Authorization Tests

### Test 5.1: Attempt to create card on non-owned board
```bash
# Create another user
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "otheruser@example.com",
    "password": "testpass123"
  }'

# Login as other user
OTHER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "otheruser@example.com", 
    "password": "testpass123"
  }' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Try to create card on first user's board
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Unauthorized card\",
    \"column\": \"todo\"
  }"
```

**Expected**: 403 Forbidden error

### Test 5.2: Attempt operations without auth
```bash
# Try to list cards without token
curl -X GET "http://localhost:3000/api/boards/$BOARD_ID/cards"

# Try to update card without token  
curl -X PUT "http://localhost:3000/api/cards/$CARD1" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hacked"}'
```

**Expected**: 401 Unauthorized errors

## Test 6: Error Handling

### Test 6.1: Invalid column name
```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"title\": \"Invalid column test\",
    \"column\": \"backlog\"
  }"
```

**Expected**: 400 Bad Request with error message

### Test 6.2: Missing required fields
```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"boardId\": \"$BOARD_ID\",
    \"column\": \"todo\"
  }"
```

**Expected**: 400 Bad Request - title is required

### Test 6.3: Non-existent board
```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "boardId": "00000000-0000-0000-0000-000000000000",
    "title": "Card for non-existent board",
    "column": "todo"
  }'
```

**Expected**: 404 Not Found

## Cleanup

```bash
# Delete the test board (cascades to delete all cards)
curl -X DELETE "http://localhost:3000/api/boards/$BOARD_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Summary Checklist

- [ ] Cards can be created in all three columns
- [ ] Cards get automatic position assignment
- [ ] Cards can be listed by board
- [ ] Individual card details can be retrieved
- [ ] Card content can be updated
- [ ] Cards can be moved between columns
- [ ] Cards can be reordered within columns
- [ ] Cards can be deleted with position adjustment
- [ ] Board ownership is enforced for all operations
- [ ] Authentication is required for all endpoints
- [ ] Proper error messages for invalid requests

## Notes

- All timestamps are in ISO 8601 format
- Positions are 0-indexed within each column
- Column values must be exactly: "todo", "doing", or "done"
- Cards are permanently deleted (no soft delete/trash)