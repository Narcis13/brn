# Calendar Time Grid Layout

**Approach**: Use CSS Grid for day columns with absolute positioning for timed events within slots.

**Example**:
```css
.calendar-week-columns {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-week-slot {
  height: 50px; /* 30-min slot */
  position: relative;
}

.calendar-week-timed-card {
  position: absolute;
  /* Height calculated based on duration */
}
```

**When to use**:
- Building time-based calendar views
- Need precise positioning of events at specific times
- Want events to overlap visually when scheduled at same time

**Benefits**:
- Clean separation between grid structure and event positioning
- Easy to calculate positions based on time
- Supports overlapping events naturally

**Confidence**: verified