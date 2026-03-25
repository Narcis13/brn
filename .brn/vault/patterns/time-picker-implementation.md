# Time Picker Implementation Pattern

## Problem
Need to add optional time components to existing date-only inputs without breaking existing functionality or data.

## Solution
Use toggle-based progressive enhancement with separate date and time inputs.

## Approach
1. **State Management**: Boolean flags track time picker visibility
   ```typescript
   const [showStartTime, setShowStartTime] = useState(false);
   const [showDueTime, setShowDueTime] = useState(false);
   ```

2. **Data Detection**: Initialize state based on data format
   ```typescript
   setShowStartTime(cardDetail.start_date ? cardDetail.start_date.includes('T') : false);
   ```

3. **Utility Functions**: Separate concerns for date/time manipulation
   ```typescript
   extractDateAndTime(dateTimeString): { date: string; time: string }
   combineDateAndTime(date: string, time: string): string
   formatDateTimeDisplay(dateTimeString: string): string
   ```

4. **Progressive UI**: Show time controls only when needed
   - Date input always visible
   - Time input appears on toggle
   - "Add time" becomes "Remove time" when active

## Example
```typescript
{showDueTime && detail.due_date && (
  <input
    type="time"
    value={extractDateAndTime(detail.due_date).time}
    onChange={(e) => void updateTime("due_date", e.target.value)}
  />
)}
```

## When to Use
- Adding time capabilities to existing date-only fields
- Need backward compatibility with date-only data
- Users don't always need time precision
- Want progressive enhancement UX

## Benefits
- Non-breaking change for existing data
- Clear user control over precision
- Native HTML5 validation
- Graceful degradation

## Confidence
Verified - implemented and tested in CardModal with full test coverage