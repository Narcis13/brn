# Date and Time Validation Pattern

## Approach
Support both date-only (YYYY-MM-DD) and datetime (YYYY-MM-DDTHH:MM) formats with strict validation, allowing flexible scheduling at either date or time precision.

## Example
```typescript
// date-utils.ts
export function isValidDateFormat(dateStr: string): boolean {
  if (!dateStr) return false;
  
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  
  if (!dateOnlyRegex.test(dateStr) && !dateTimeRegex.test(dateStr)) {
    return false;
  }
  
  // Parse and validate components
  const [datePart, timePart] = dateStr.split('T');
  // ... component validation
  
  // Validate actual date (catches Feb 30, etc.)
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  
  // Time validation: reject 24:00, accept 00:00-23:59
  if (timePart) {
    if (hours === undefined || hours < 0 || hours > 23) return false;
    if (minutes === undefined || minutes < 0 || minutes > 59) return false;
  }
  
  return true;
}

// routes.ts - endpoint validation
if (body.due_date !== undefined && body.due_date !== null && !isValidDateFormat(body.due_date)) {
  return c.json({ error: "due_date must be in format YYYY-MM-DD or YYYY-MM-DDTHH:MM" }, 400);
}
```

## When to use
- Calendar features requiring both all-day and timed events
- Backward compatibility when upgrading date-only fields to support time
- User interfaces that progressively enhance from date to datetime selection
- APIs that need to accept both precision levels without separate fields

## Key insights
- ISO 8601 format allows lexicographic string comparison for date ordering
- Separate regex patterns make format validation clear and maintainable  
- Component validation catches edge cases like leap years and invalid days
- TypeScript strict null checks require careful handling of split() results
- Allowing null values enables clearing dates through the same API

**Confidence**: verified