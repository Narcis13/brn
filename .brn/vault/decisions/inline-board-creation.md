---
title: Inline input for single-field entity creation over modal
type: decision
confidence: verified
source: run-002
feature: auth-and-boards
created: 2026-03-23
---

## Choice
Board creation uses an inline input that replaces the "Create new board" card in the grid, with Create/Cancel buttons and Enter/Escape keyboard support.

## Alternatives Considered
1. **Modal dialog**: Consistent with card editing (which uses a modal) — but a modal for a single text field feels heavy.
2. **Separate page/form**: Too much navigation friction for a one-field operation.
3. **Prompt/confirm dialog**: `window.prompt()` works but looks ugly and can't be styled.

## Rationale
A single-field creation form doesn't warrant the visual weight of a modal. The inline approach keeps the user in context — they see the input right where the board will appear. Escape to cancel, Enter to submit. The card modal pattern is reserved for multi-field editing (title + description).
