---
title: Deterministic avatar colors via username hash
type: decision
confidence: verified
source: run-005
feature: social-interactions
created: 2026-03-25
---

## Choice
Generate avatar background colors by hashing the username string into an index over a preset array of 10 colors. The same username always produces the same color.

## Alternatives Considered
- Random color per session — inconsistent across views
- Server-stored color preference — unnecessary database column and API complexity
- CSS-only nth-child coloring — breaks when member order changes

## Rationale
The hash approach is simple, deterministic, and requires zero server state. It ensures the same user always appears with the same color across the board header, timeline comments, and any future avatar displays. The 10-color palette was chosen to match the existing label color palette for visual consistency.
