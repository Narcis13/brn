# Run 002: Enhanced Card Endpoints and Activity Tracking

## Overview
This run focused on implementing the enhanced card endpoints (AC6-AC8) that add support for dates, checklists, activity tracking, and full card detail retrieval. Building on the label functionality from the previous run, I added comprehensive activity logging and card enhancement features.

## What Happened

### 1. Task Planning
- Used TodoWrite to track implementation of activity helpers, enhanced card updates, and new endpoints
- Organized work into: database functions, API endpoints, and comprehensive testing

### 2. Activity Helper Functions
Added to `db.ts`:
- `createActivity()`: Creates activity log entries with JSON detail support
- `getCardActivity()`: Retrieves paginated activity (limit 50, offset support)
- Modified `createCard()` to automatically log "created" activity

### 3. Enhanced Card Update System
- Modified `updateCard()` to accept new fields:
  - `dueDate` and `startDate` (nullable strings)
  - `checklist` (JSON string)
- Added validation: start_date must be <= due_date
- Created `updateCardWithActivity()` wrapper that:
  - Tracks all changes (title, description, dates, checklist, position)
  - Creates appropriate activity entries:
    - "moved" when column changes (includes from/to column names)
    - "dates_changed" when dates are modified
    - "edited" for other changes
  - Ensures activity is only created when actual changes occur

### 4. Card Detail Function
Created `getCardDetail()` that returns:
- Full card data from database
- Array of assigned labels (via joins)
- Activity log (last 50 entries)
- Computed `checklist_total` and `checklist_done` fields

### 5. Enhanced API Endpoints

#### PATCH /api/boards/:boardId/cards/:cardId (AC6)
- Now accepts: `due_date`, `start_date`, `checklist`
- Validates date range (start <= due)
- Validates checklist JSON structure and item fields
- Uses `updateCardWithActivity()` for automatic activity logging
- Returns 400 for validation errors

#### GET /api/boards/:boardId/cards/:cardId (AC7)
- New endpoint returning full card detail
- Includes labels array, activity log, checklist stats
- Verifies card belongs to specified board
- Returns 404 for non-existent/unauthorized cards

#### GET /api/boards/:boardId/cards/:cardId/activity (AC8)
- New endpoint for paginated activity retrieval
- Supports `offset` query parameter
- Returns activities newest first
- Limit of 50 per request

### 6. Enhanced Label Operations
- Modified label assignment to create "label_added" activity
- Modified label removal to create "label_removed" activity
- Both operations now leave audit trail

### 7. Comprehensive Testing
Created `routes-card-detail.test.ts` with 15 tests covering:
- Date validation and updates
- Checklist validation (JSON format, item structure)
- Activity creation for all change types
- Card detail retrieval with computed fields
- Activity pagination
- Error cases and authorization

### 8. Results
- All 83 tests passing ✓
- TypeScript compilation successful ✓
- Zero type errors or warnings

## Key Decisions

1. **Activity Detail as JSON**: Used flexible JSON field for action-specific data (e.g., column names for moves)
2. **50-item Activity Limit**: Balanced between usefulness and performance
3. **Separate Date Activity**: "dates_changed" gets its own activity type for clarity
4. **Nullable Dates**: Allow clearing dates by passing null
5. **Strict Checklist Validation**: Each item must have id, text, and checked fields

## Technical Implementation Details

- **Position Management**: Preserved existing card position update logic when moving between columns
- **Activity Timestamps**: Rely on SQLite's DEFAULT for consistent timestamps
- **Type Safety**: Created `CardDetail` interface extending `CardRow`
- **Error Handling**: Consistent 400/404 responses with clear error messages

## Files Modified
- `/trello/src/db.ts`: Added activity helpers and enhanced update functions
- `/trello/src/routes.ts`: Enhanced PATCH endpoint, added 2 new GET endpoints
- `/trello/src/routes-card-detail.test.ts`: Created with comprehensive test coverage

## Acceptance Criteria Progress
- ✅ AC6: Enhanced PATCH with dates, checklist, validation, and activity
- ✅ AC7: GET card detail with labels, activity, and computed fields
- ✅ AC8: GET paginated activity endpoint

## Next Steps
The next run should implement:
1. Search endpoint (AC9) - Text search, label filter, due date filter
2. Column reorder endpoint (AC10)
3. Begin frontend implementation (AC11-AC17)