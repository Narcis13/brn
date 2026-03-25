# Run 006: Reaction Picker + Board Activity Sidebar (Feature Complete)

## Context
After run-005 built the core UI — member avatars, watch button, unified timeline, comment CRUD, and @mention rendering — two ACs remained: AC12 (reaction picker) and AC14 (board activity sidebar). Both are UI-only features since all backend APIs were built in runs 001-004.

## Approach
Tackle both remaining ACs in one run since they're independent UI features with no backend changes. The reaction picker extends the existing timeline items, while the activity sidebar is a new overlay panel in BoardView.

## What Was Built

### Files Modified
- `trello/src/ui/CardModal.tsx` — Added `ReactionBar` component (smiley icon on hover, 8-emoji horizontal picker, click-to-toggle reactions via API, interactive clickable reaction chips). Added `@mention` autocomplete dropdown to comment textarea with arrow key navigation, Enter/Tab to select, and Escape to dismiss. Replaced static reaction chips with the interactive `ReactionBar` on both comment and activity timeline items.
- `trello/src/ui/BoardView.tsx` — Added activity sidebar state/logic. Clock icon toggle button in board header. Full-width overlay panel sliding from right with header, scrollable body showing activity+comment feed, member avatars, card title links that open card modal, "Load more" pagination, click-outside and Escape to dismiss.
- `trello/public/styles.css` — Added styles for: interactive reaction chips (hover states), reaction bar wrapper with positioned emoji picker, @mention autocomplete dropdown, activity sidebar toggle button, overlay panel with slide-in animation, sidebar items with avatar/content/timestamp layout, card title links, load more button.
- `trello/src/ui/social-interactions.test.ts` — Added 12 new tests covering: allowed emoji set validation, reaction count display, interactive chip mine-state computation, @mention query extraction from cursor position, member filtering by prefix, mention insertion at correct position, activity sidebar relative time, pagination cursor logic, load-more append behavior, comment preview truncation, and activity item type indicators.

## Key Decisions
- **ReactionBar as a self-contained component**: Encapsulates picker state, click-outside dismissal, and API calls. Each timeline item gets its own ReactionBar instance — simpler than lifting state.
- **Smiley button visible on hover only**: Uses CSS `.timeline-item:hover .btn-add-reaction` to show the reaction trigger, keeping the timeline clean when not interacting.
- **Emoji picker positioned above the trigger**: `position: absolute; bottom: 100%` keeps it in view even at the bottom of the timeline.
- **Activity sidebar as overlay, not push**: Uses `position: fixed` overlay with a positioned sidebar panel. Click-outside on the overlay area dismisses it. Does not push board content.
- **Pagination via before cursor**: Passes the last item's timestamp as the `before` parameter for load-more, matching the existing API contract.

## Challenges & Solutions
- No significant challenges. All APIs were already built and tested. The main care point was ensuring the reaction picker click-outside doesn't interfere with the timeline item hover detection — solved by using `mousedown` events and proper ref containment checks.

## Verification Results
- Tests: 320 passed, 0 failed
- Types: Clean (source files)
- Build: Success

## Acceptance Criteria Progress
- AC12 met this run: Reaction picker with emoji bar, interactive chips, toggle
- AC14 met this run: Board activity sidebar with pagination, card links
- Overall: 14/14 met — FEATURE COMPLETE

## Vault Entries Added
- reaction-picker-component-pattern.md (pattern): Self-contained reaction picker with hover trigger and positioned emoji bar
- activity-sidebar-overlay-pattern.md (pattern): Slide-in overlay sidebar with pagination and click-outside dismissal

## What's Next
All acceptance criteria met. Create PR to finalize the feature.
