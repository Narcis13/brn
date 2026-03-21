---
name: seeyoulater
description: Context window handoff skill. Detects when the conversation is approaching 70%+ context usage and gracefully pauses work by writing a SPRINT_HANDOFF.md memory-bridge file so a fresh session can resume seamlessly. Trigger when: (1) user says "seeyoulater", "/seeyoulater", "context is full", "wrap up", or "hand off to next session", (2) Claude estimates context usage is at or past 70%, (3) Claude is mid-task and cannot finish cleanly in remaining context.
---

# seeyoulater

Stop current work immediately. Do NOT squeeze in more code. A clean handoff beats a rushed completion.

## Step 1 — Write SPRINT_HANDOFF.md

Write to the project root (or nearest logical location). Use `SPRINT_HANDOFF_2.md`, `_3.md`, etc. if one already exists.

```md
# Sprint Handoff — <date>

## Context
<1-2 sentences: overall goal/feature being built>

## What Was Implemented
- <file path + what changed>
- <decisions made and why>
- <tests written, commands verified>

## What Remains
- <next task to pick up>
- <subsequent tasks in priority order>
- <known blockers or open questions>

## Files Touched This Sprint
- `path/to/file.ts` — description
- `path/to/other.ts` — description

## Commands to Verify State
\`\`\`sh
bun test
bun run <relevant-script>
\`\`\`

## How to Continue
Start a new Claude Code session and say:
"Read SPRINT_HANDOFF.md and continue from where we left off"
```

## Step 2 — Tell the User

> **Context window is getting full — pausing here for a clean handoff.**
>
> I've written `SPRINT_HANDOFF.md` with what's done and what remains.
>
> Start a new Claude Code session and say:
> _"Read SPRINT_HANDOFF.md and continue from where we left off"_
>
> See you in the next sprint!

## Step 3 — Stop

No further tool calls or code changes. Session is complete.

## Rules
- Be honest: partial done is fine, unclear is not
- Include exact file paths and function names so the next Claude can orient fast
- State explicitly whether tests pass, fail, or are not yet written
- Trigger early (70%) not late (95%)
