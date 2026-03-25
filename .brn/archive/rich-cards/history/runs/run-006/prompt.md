## Goal
Complete the remaining board-surface work for `rich-cards` by adding board-level search/filter UI, a no-results state, and HTML5 column drag-reordering backed by the existing API endpoints.

## Relevant Spec Excerpts
- `AC13`: Column drag-reorder using HTML5 drag-and-drop on column headers.
- `AC14`: Search bar above columns with real-time client-side filtering and debounced API search; filter bar with label pills toggle.
- `AC17`: Show a centered "No cards match your search" message when search has no visible matches.

## Steering Constraints
- No active steering directives.

## Relevant Vault Knowledge
- `column-cards-rich-metadata`: board columns already include labels and checklist summary data, so board filtering can operate on the existing payload without fetching per-card detail.
- `local-date-only-filters`: date-only filters in this repo use local `YYYY-MM-DD` normalization; keep client logic aligned with the existing backend assumptions.
- `modal-optimistic-reconcile`: board-level optimistic updates should preserve the modal’s local edits instead of forcing extra detail fetches.

## Files Likely To Change
- `trello/src/ui/BoardView.tsx`
- `trello/src/ui/api.ts`
- `trello/src/ui/board-utils.ts`
- `trello/src/ui/board-utils.test.ts`
- `trello/public/styles.css`

## Expected Verification
- `bun test`
- `bunx tsc --noEmit`
- `cd trello && bun run build.ts`
