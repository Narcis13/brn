---
title: Three-tier comment authorization (create=member, edit=author, delete=author+owner)
type: decision
confidence: verified
source: run-002
feature: social-interactions
created: 2026-03-25
---

## Choice
Comments use three authorization levels:
- **Create**: any board member
- **Edit**: comment author only
- **Delete**: comment author OR board owner (moderation)

## Alternatives Considered
- Uniform author-only for edit+delete (no moderation)
- Owner can edit others' comments (too invasive)
- Admin role for moderation (out of scope — only owner/member roles exist)

## Rationale
Board owners need moderation power without impersonation ability. Deleting inappropriate content is a moderation action; editing someone else's words would be impersonation. This maps to common patterns in GitHub, Trello, and Slack.
