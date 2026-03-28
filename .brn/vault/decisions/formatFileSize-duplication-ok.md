---
title: formatFileSize helper duplication is acceptable
type: decision
confidence: verified
source: run-003
feature: card-artifacts
created: 2026-03-28
---

## Choice
Duplicate the `formatFileSize` helper function in cli-card.ts and cli-board.ts rather than creating a shared utility.

## Alternatives
1. Create a shared cli-utils.ts function
2. Import from cli-artifact.ts
3. Duplicate in each file (chosen)

## Rationale
- The function is only 3 lines
- It's used in exactly 3 CLI files
- No existing pattern for sharing such micro-utilities
- Avoids cross-file dependencies for trivial helpers
- Consistent with how other CLI files handle small helpers

## Context
When a utility function is very small (<5 lines) and used in only a few files, duplication is preferable to creating dependencies. This keeps files more self-contained.