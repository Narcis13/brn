---
title: Existing cards autosave, new cards keep explicit creation
type: decision
confidence: verified
source: run-005
feature: rich-cards
created: 2026-03-23
---

## Decision
Existing cards in the detail modal save immediately on blur or change, but creating a brand-new card still uses an explicit submit action.

## Rationale
- Autosave requires an existing server entity; a not-yet-created card has no durable id to patch.
- Keeping creation explicit avoids creating partial empty cards while still satisfying the no-save-button behavior for real card detail editing.
- The split keeps the edit experience fast without complicating the board with transient placeholder records.
