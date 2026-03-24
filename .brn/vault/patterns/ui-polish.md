# UI Polish Patterns

## Loading States
**Approach**: Use skeleton loaders with pulse animation for better perceived performance  
**Example**: Calendar view skeleton adapts to view mode (42 cells for month, custom layout for week)  
**When to use**: Any async data loading that takes >200ms  
**Confidence**: verified

## Empty States
**Approach**: Position empty state messages outside data containers for visibility  
**Example**: Calendar empty state appears below grid, not inside it  
**When to use**: When data containers might be hidden during loading  
**Confidence**: verified

## Visual Hierarchy
**Approach**: Use subtle background shading to differentiate sections  
**Example**: Weekend columns use rgba(223, 225, 230, 0.25) for gentle contrast  
**When to use**: When differentiating repeating elements without harsh borders  
**Confidence**: verified

## Overflow Handling
**Approach**: Show limited items with "+N more" pattern  
**Example**: Calendar cells show max 3 cards then "+2 more"  
**When to use**: Lists in constrained spaces where full expansion would break layout  
**Confidence**: verified

## Date Highlighting
**Approach**: Use background color + special styling for current date  
**Example**: Today cell has blue background + circular day number  
**When to use**: Calendar/timeline views to orient users in time  
**Confidence**: verified