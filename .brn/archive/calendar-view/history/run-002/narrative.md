# Run 002: Calendar Data Endpoint

## Context
Second run of the calendar-view feature. AC1 (date validation) and AC3 (PATCH validation) were completed in run 001. Focus on AC2: Calendar data endpoint.

## What Happened
1. **Test-First Development**: Created comprehensive tests for the calendar endpoint before implementation:
   - Date range filtering (cards within range)
   - Overlapping date logic (spans into, out of, or entire range)
   - Rich data response (labels, checklist counts, column info)
   - Edge cases (only start_date, empty results)
   - Validation (missing/invalid parameters)
   - Security (404 for other users' boards)

2. **Database Query Implementation**: 
   - Added `CalendarCardResult` interface extending card data with calculated fields
   - Created `getCalendarCards` function with complex date overlap logic
   - Three overlap conditions: due in range, start in range, or spanning range
   - Reused label batching pattern from search endpoint

3. **Route Handler**:
   - Added GET /api/boards/:boardId/calendar endpoint
   - Parameter validation reusing existing `isValidDateFormat`
   - Clean error messages for missing or invalid dates

4. **Testing Results**: All 134 tests pass, including 8 new calendar endpoint tests

## Key Decisions
- **Date Range SQL**: Used compound OR conditions for flexibility
- **Rich Response**: Include labels and checklist counts like board view
- **Parameter Validation**: Reuse existing date validation for consistency
- **Batch Loading**: Prevent N+1 queries with label batching

## Challenges
- Complex SQL overlap logic required careful parameter binding order
- Maintaining consistency with existing card response shapes

## Learnings
- Date range queries benefit from explicit NULL checks in SQL
- ISO 8601 format enables string comparison for date ranges
- TDD helped catch edge cases early (e.g., cards with only start_date)

## Next Steps
AC2 is now complete. Next priorities would be the UI components:
- AC4: Board|Calendar tab toggle
- AC5: Month view grid
- Or continuing with more backend work first