## Goal
Implement the next frontend-rich-cards slice: replace the basic card editor with a real card detail modal, expose rich metadata on board cards, and keep edits saving immediately without a save button for existing cards.

## Relevant Spec Excerpts
- `AC11`: Card detail modal opens on card click and includes editable title, labels, dates, formatted description, checklist with progress, activity log, and close controls.
- `AC12`: Board card face shows label dots, due-date badge, and checklist progress.
- `AC15`: Label picker in card detail toggles assignments and supports creating labels from a preset palette.
- `AC16`: Changes in card detail save immediately on blur/change with optimistic UI.
- `AC17`: Empty states for checklist, labels, and activity are handled.

## Steering Constraints
- No active steering directives.

## Relevant Vault Knowledge
- `patterns/react-auth-state-machine.md`: keep client state transitions explicit and typed.
- `codebase/local-date-only-filters.md`: due dates are stored as `YYYY-MM-DD`; treat them as date-only values.
- `anti-patterns/unstyled-ui.md`: UI work is not done without coherent styling.

## Files Likely To Change
- `trello/src/db.ts`
- `trello/src/routes.ts`
- `trello/src/ui/api.ts`
- `trello/src/ui/BoardView.tsx`
- `trello/src/ui/CardModal.tsx`
- `trello/public/styles.css`

## Expected Verification
- `bun test`
- `bunx tsc --noEmit`
- `cd trello && bun run build.ts`
