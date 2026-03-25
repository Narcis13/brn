---
title: Social Interactions — Comments, reactions, mentions, watchers, and board activity feed
status: done
priority: high
---

## What
Add multi-user board collaboration and social interactions to the Trello clone. Board owners can invite other users by username. Members can comment on cards, react with emoji to comments and activity items, @mention each other in comments, and watch cards for changes. A board-level activity sidebar shows all recent activity across the board. Comments and system activity are displayed in a single unified timeline inside the card modal.

## Why
The app currently tracks card changes mechanically but has no user-authored social layer. Comments are the most fundamental collaboration primitive — they let team members discuss cards, ask questions, and share context. Reactions provide lightweight social signals. @mentions create direct attention. Watchers let users subscribe to cards they care about. Together these transform a personal task board into a collaborative workspace.

## User Stories
- As a board owner, I want to invite other users to my board so we can collaborate
- As a board member, I want to comment on cards so I can discuss tasks with my team
- As a board member, I want to edit and delete my own comments so I can correct mistakes
- As a board owner, I want to delete any comment on my board for moderation
- As a board member, I want to react to comments and activity with emoji so I can acknowledge without a full reply
- As a board member, I want to @mention teammates in comments so they know I'm addressing them
- As a board member, I want to watch a card so I can track changes to cards I care about
- As a board member, I want to see all recent board activity in a sidebar so I can catch up on what happened

## Requirements

### Data Model

#### board_members table
- `board_id` TEXT NOT NULL, FK → boards(id) ON DELETE CASCADE
- `user_id` TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
- `role` TEXT NOT NULL CHECK(role IN ('owner', 'member'))
- `invited_at` TEXT NOT NULL DEFAULT (datetime('now'))
- PRIMARY KEY (board_id, user_id)
- When a board is created, the creator is automatically inserted as `role: 'owner'`

#### comments table
- `id` TEXT PRIMARY KEY
- `card_id` TEXT NOT NULL, FK → cards(id) ON DELETE CASCADE
- `board_id` TEXT NOT NULL, FK → boards(id) ON DELETE CASCADE
- `user_id` TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
- `content` TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 5000)
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `updated_at` TEXT NOT NULL DEFAULT (datetime('now'))

#### reactions table
- `id` TEXT PRIMARY KEY
- `target_type` TEXT NOT NULL CHECK(target_type IN ('comment', 'activity'))
- `target_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
- `emoji` TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 10)
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- UNIQUE(target_type, target_id, user_id, emoji) — one reaction per emoji per user per target

#### card_watchers table
- `card_id` TEXT NOT NULL, FK → cards(id) ON DELETE CASCADE
- `user_id` TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
- PRIMARY KEY (card_id, user_id)

#### activity table changes
- Add `user_id` TEXT column (nullable — existing system entries have no user)
- All new activity entries record the acting user's ID

### Authorization
- Board access: board owner OR any member of the board (checked via board_members)
- All existing board-scoped endpoints must now check board_members instead of just `board.user_id === userId`
- Comments: create requires board membership; edit requires authorship; delete requires authorship OR board ownership
- Reactions: add/remove requires board membership
- Watchers: requires board membership
- Board member management: invite/remove requires board ownership

### API Endpoints

#### Board Members
- `GET /api/boards/:boardId/members` → `{ members: [{ id, username, role, invited_at }] }`
- `POST /api/boards/:boardId/members` → `{ username }` → adds user as `member`; 404 if username not found; 409 if already a member; returns the new member object
- `DELETE /api/boards/:boardId/members/:userId` → owner-only; cannot remove self (owner); returns `{ ok: true }`

#### Comments
- `POST /api/boards/:boardId/cards/:cardId/comments` → `{ content }` → creates comment, creates "commented" activity entry, auto-watches the card for the commenter; returns the comment with `{ id, content, user_id, username, created_at, updated_at, reactions: [] }`
- `PATCH /api/boards/:boardId/cards/:cardId/comments/:commentId` → `{ content }` → author-only edit; updates `updated_at`; returns updated comment
- `DELETE /api/boards/:boardId/cards/:cardId/comments/:commentId` → author or board owner; returns `{ ok: true }`

#### Reactions
- `POST /api/boards/:boardId/reactions` → `{ target_type, target_id, emoji }` → toggle: adds if not exists, removes if exists; returns `{ action: 'added' | 'removed', reaction: { id, emoji, user_id } }`
- Allowed emoji set (enforced server-side): 👍 👎 ❤️ 🎉 😄 😕 🚀 👀 (8 emoji)

#### Watchers
- `POST /api/boards/:boardId/cards/:cardId/watch` → toggle: watches if not watching, unwatches if watching; returns `{ watching: boolean }`
- Card detail response includes `is_watching: boolean` and `watcher_count: number`

#### Card Detail Enhancement
- `GET /api/boards/:boardId/cards/:cardId` response now includes:
  - `timeline: [{ type: 'comment' | 'activity', ...fields }]` — unified sorted list (newest first)
  - Comments in timeline include: `id, content, user_id, username, created_at, updated_at, reactions: [{ emoji, count, user_ids }]`
  - Activity in timeline include: `id, action, detail, user_id, username, timestamp, reactions: [{ emoji, count, user_ids }]`
  - `is_watching: boolean`
  - `watcher_count: number`
  - `board_members: [{ id, username }]` (for @mention autocomplete)

#### Board Activity Feed
- `GET /api/boards/:boardId/activity?limit=30&before=<timestamp>` → paginated board-wide activity + comments, newest first; returns `{ items: [{ type, ...fields }], has_more: boolean }`
- Default limit: 30, max limit: 100

### UI Requirements

#### Board Header — Members & Invite
- Member avatars displayed as colored circles with initials (first letter of username, uppercase) next to board title
- Max 5 avatars shown, "+N" overflow for more
- Invite button (+ icon) opens a popover with a username text input
- Popover: type username, press Enter or click "Invite" to add; show success/error inline; close on outside click or Escape
- Owner badge on the board owner's avatar

#### Card Modal — Unified Timeline
- Replace the current "Activity" section with a unified timeline
- Timeline header: "Activity" with a count of comments
- Each timeline item shows:
  - **Comment**: user initial avatar (colored) + username + content (with rendered @mentions as bold text) + relative timestamp + edit/delete buttons (contextual) + reaction bar
  - **System activity**: small icon + description text + relative timestamp + reaction bar (more subtle styling than comments)
- Comment items are visually prominent (larger, card-like); system activity items are compact
- Edit mode: clicking edit replaces content with a textarea, Save/Cancel buttons
- Delete: confirmation before removing

#### Comment Input
- Text input area at the bottom of the timeline (or top — above the timeline)
- Placeholder: "Write a comment..."
- Expands on focus to a textarea with a "Save" button
- @mention: typing `@` triggers a dropdown of board members filtered by typed text; selecting inserts `@username`; rendered as bold in the comment display
- Submit on Ctrl+Enter or clicking Save; disabled when empty or whitespace-only

#### Reaction Picker
- Small "add reaction" button (smiley icon) on hover of any timeline item
- Click opens a horizontal bar of the 8 allowed emoji
- Clicking an emoji toggles the reaction; existing reactions shown as chips below the item: `👍 2  ❤️ 1`
- Chips are clickable to toggle own reaction; highlighted if current user reacted
- Reactions from the current user shown with a distinct border/background

#### Watch Button
- Eye icon button in card modal header (next to close button)
- Filled/highlighted when watching, outline when not
- Tooltip: "Watch" / "Watching"
- Watcher count shown next to the icon
- Auto-watch when commenting (user can manually unwatch after)

#### Board Activity Sidebar
- Toggle button in board header (clock/activity icon)
- Slides in from the right as an overlay panel (does not push board content)
- Shows unified feed of all board activity + comments, newest first
- Each item shows: user avatar + description + card title link + relative timestamp
- Clicking a card title opens the card modal
- Infinite scroll / "Load more" button for pagination
- Close button and click-outside to dismiss

### @Mention Behavior
- In comment content, `@username` is stored as plain text
- On display, `@username` patterns matching a board member are rendered as bold styled text
- @mention autocomplete dropdown appears when typing `@` in the comment input
- Dropdown filters as user types, shows matching member usernames
- Selecting from dropdown inserts `@username ` (with trailing space)

## Edge Cases
- **Inviting non-existent user**: 404 error, message "User not found"
- **Inviting existing member**: 409 error, message "User is already a board member"
- **Removing self as owner**: 400 error, message "Cannot remove the board owner"
- **Editing someone else's comment**: 403 error
- **Comment on card in inaccessible board**: 403 error
- **Reaction on deleted comment**: 404 error
- **@mentioning non-member**: rendered as plain text (no special styling)
- **Empty comment**: 400 validation error, not submitted
- **Very long comment (>5000 chars)**: 400 validation error
- **Board member removed while viewing board**: next API call returns 403, UI shows "You no longer have access"
- **Card deleted while someone is commenting**: 404 on comment submit
- **Activity items from before user_id was added**: show "System" as the actor

## Tech Stack
- Runtime: Bun
- HTTP framework: Hono
- Database: bun:sqlite
- Frontend: React (TSX)
- Build: bun build
- Styling: CSS file (existing styles.css)

## Out of Scope
- Email or push notifications (watchers track interest but no notification delivery)
- File/image attachments on comments
- Comment threading / replies (flat comments only for v1)
- Rich text formatting in comments (plain text + @mentions only)
- User profile pictures / avatar uploads (initials-based avatars only)
- Board roles beyond owner/member (no admin, viewer, etc.)
- Transferring board ownership
- Shareable invite links (username-based only)
- Real-time updates via WebSocket (polling or manual refresh for v1)
