# Builder Prompt: Database Migration for Rich Cards Feature

You are the Builder, implementing the first step of the rich-cards feature. This is run 001, focusing on creating the database migration.

## Context
- Feature: rich-cards 
- Status: planning → in_progress
- Acceptance Criteria to address in this run:
  - AC1: Labels table (id, board_id, name, color, position) with UNIQUE(board_id, name); Card-Labels junction table with CASCADE deletes
  - AC2: Cards table gains description, due_date, start_date, checklist (JSON), created_at, updated_at columns — migration non-destructive
  - AC3: Activity table (id, card_id, board_id, action enum, detail JSON, timestamp) with CASCADE deletes

## Current Database Schema
From `/trello/src/db.ts`:
- cards table already has: id, title, description, position, column_id, created_at
- Need to add to cards: due_date, start_date, checklist, updated_at
- Need to create: labels, card_labels (junction), activity tables

## Your Task
1. Modify `/trello/src/db.ts` to add the new tables and columns in the migrate function
2. Add new TypeScript interfaces for the new database rows
3. Ensure migration is non-destructive (preserve existing data)
4. Follow existing patterns in the codebase

## Implementation Details
- Labels table:
  - id TEXT PRIMARY KEY (use nanoid)
  - board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE
  - name TEXT NOT NULL (max 30 chars)
  - color TEXT NOT NULL (hex color)
  - position INTEGER NOT NULL
  - UNIQUE(board_id, name)

- Card-Labels junction:
  - card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE
  - label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE
  - PRIMARY KEY (card_id, label_id)

- Cards additions:
  - due_date TEXT DEFAULT NULL (ISO 8601 date)
  - start_date TEXT DEFAULT NULL (ISO 8601 date)
  - checklist TEXT DEFAULT '[]' (JSON array)
  - updated_at TEXT NOT NULL (set to current time for existing rows)

- Activity table:
  - id TEXT PRIMARY KEY
  - card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE
  - board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE
  - action TEXT NOT NULL (store as string, validate in app)
  - detail TEXT DEFAULT NULL (JSON)
  - timestamp TEXT NOT NULL

## Success Criteria
- New tables created with proper foreign key constraints
- Cards table enhanced with new columns
- Existing data preserved (non-destructive)
- TypeScript interfaces added for new row types
- No type errors when running `bunx tsc --noEmit`
- Tests can be written to verify schema (next step)

## Key Reminders
- Use Bun runtime (not Node.js)
- Follow existing code patterns in db.ts
- Don't use any type or @ts-ignore
- Preserve the existing migrate function structure
- Add new schema after existing tables