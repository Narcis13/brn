---
title: Layered Rendering for Calendar Multi-day Bars
type: decision
confidence: verified
source: run-005
feature: calendar-view
created: 2026-03-24
---

## Choice
Render multi-day bars as a separate layer above regular calendar cells using absolute positioning, rather than embedding them within cell content.

## Alternatives Considered
1. **Inline bars within cells**: Each cell contains part of the bar
2. **CSS Grid spanning**: Use grid-column to span cells
3. **Canvas overlay**: Draw bars on a canvas layer

## Rationale
- **Absolute positioning with CSS Grid spanning** provides clean visual separation between multi-day spans and single-day cards
- Grid spanning handles week boundaries elegantly by breaking bars into per-week segments
- Z-index layering ensures multi-day bars appear above single-day chips
- Easier to implement drag-and-drop later since bars are separate elements
- Better performance than canvas for interactive elements