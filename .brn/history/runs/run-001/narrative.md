# Run 001: Date Validation Enhancement

## Context
First run of the calendar-view feature. Starting with AC1: "Cards due_date and start_date accept both YYYY-MM-DD and YYYY-MM-DDTHH:MM formats".

## What Happened
1. **Analyzed current state**: Feature status was "planning" with 0 runs, indicating this is the initial implementation.

2. **Created date validation utility** (`date-utils.ts`):
   - Built regex patterns for both date-only and datetime formats
   - Added comprehensive validation including leap year checks
   - Rejected edge cases like 24:00, accepted 00:00-23:59
   - Added comparison function for date ordering

3. **Enhanced routes validation**:
   - Updated PATCH `/api/boards/:boardId/cards/:id` to use new validation
   - Preserved existing null-clearing behavior
   - Added clear error messages for invalid formats

4. **Comprehensive testing**:
   - Unit tests for date-utils (12 tests covering all validation cases)
   - Integration tests for routes (9 tests for the PATCH endpoint)
   - All 126 existing tests still pass - no regressions

5. **TypeScript fixes**: Resolved strict mode issues with proper undefined checks.

## Key Decisions
- Used ISO 8601 format (YYYY-MM-DDTHH:MM) without seconds or timezone
- Allowed both formats in the same field for backward compatibility
- Kept validation in a separate utility for reusability
- Maintained lexicographic string comparison for date ordering

## Challenges
- TypeScript strict mode required careful handling of array destructuring
- Had to ensure backward compatibility with existing date-only values

## Next Steps
AC1 is now complete. Next logical step would be implementing the calendar data endpoint (AC2) that can filter cards by date range, leveraging our new date format support.