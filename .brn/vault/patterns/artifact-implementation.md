# Artifact Implementation Pattern

**Problem**: Implementing file-like content attachments for cards and boards in a kanban system.

**Solution**: Create a unified artifacts table that supports both card-level and board-level artifacts with proper validation and UI integration.

**Approach**:

1. Database design:
   - Single `artifacts` table with nullable `card_id` for board-level artifacts
   - Unique constraints on (card_id, filename) and separate index for (board_id, filename) where card_id IS NULL
   - Support for multiple filetypes (md, html, js, ts, sh) with strict validation

2. CLI implementation:
   - Separate module `cli-artifact.ts` with all artifact commands
   - Smart target detection: try card first, then board (with --board flag override)
   - File I/O using Bun.file() for reading and writing
   - Script execution using Bun.$ for shell scripts and `bun run` for JS/TS

3. API design:
   - Card artifacts: `/api/boards/:boardId/cards/:cardId/artifacts`
   - Board artifacts: `/api/boards/:boardId/artifacts?scope=board`
   - Single artifact operations: `/api/boards/:boardId/artifacts/:id`
   - Content size validation at API layer (413 status for >100KB)

4. UI implementation:
   - Expandable list view with click-to-view content
   - Inline editing with textarea
   - File type icons using emoji
   - Separate state management for form, expanded items, and editing
   - Reusable pattern for both card and board artifacts
   - Permission-based UI controls (show edit/delete only for members)

**Example**:
```typescript
// Smart content loading - only fetch when needed
async function loadArtifactContent(artifactId: string): Promise<void> {
  if (!card) return;
  try {
    const artifact = await api.fetchArtifact(boardId, artifactId);
    setExpandedArtifactContent(artifact.content || "");
  } catch (err: unknown) {
    setError(getErrorMessage(err));
  }
}
```

**When to use**: When implementing file attachments that need to be:
- Version-controlled (stored in DB as text)
- Executable (for scripts)
- Size-limited (text content only)
- Associated with either cards or boards

**Confidence**: verified - Successfully implemented all CLI commands, API endpoints, and UI components