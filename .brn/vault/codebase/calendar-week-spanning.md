---
title: Handling Week-spanning Cards in Calendar
type: codebase
confidence: verified
source: run-005
feature: calendar-view
created: 2026-03-24
---

## Insight
Cards that span multiple weeks need to be rendered as separate bars for each week row, with the title only shown on the first segment to avoid repetition.

## Implications
- Calculate start/end week for each multi-day card
- Render separate div elements per week segment
- Only show title on the first week's bar
- Maintain visual continuity through consistent styling
- Consider visual indicators for continuation (future enhancement)

## Evidence
Observed in CalendarView.tsx lines 301-336 where multi-week spanning logic splits bars across calendar rows, rendering title only on startWeek segment.