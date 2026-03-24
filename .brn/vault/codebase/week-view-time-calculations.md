# Week View Time Calculations

The calendar week view uses specific calculations for time slot mapping:

**Time Slot Generation**:
- 31 slots from 07:00 to 22:00 (15 hours × 2 slots/hour + 1)
- Each slot is 50px height (30 minutes)
- Slots stored as array: ["7:00", "7:30", "8:00", ...]

**Card-to-Slot Mapping**:
```typescript
// Check if card falls in 30-min slot
return cardHour === hour && 
  ((minute === 0 && cardMinute >= 0 && cardMinute < 30) ||
   (minute === 30 && cardMinute >= 30 && cardMinute < 60));
```

**Duration Calculation**:
- Cards with start/end times span multiple slots
- Height = (durationMinutes / 30) * 50px
- Minimum height is 50px (one slot)

**Week Boundaries**:
- Week starts on Monday (day 1)
- Sunday wraps to day 0, adjusted with: `day === 0 ? -6 : 1`
- Week spans calculated with ISO date strings for consistent comparison

**Confidence**: verified