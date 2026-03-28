Now I'll craft a focused prompt for the Builder to implement artifact search integration:

---

# Implement Artifact Search Integration (AC14)

You need to modify the search functionality to include artifact content and filenames in search results. The search should return matches from both card content and artifact content, showing the card ID, card title, artifact filename, and match context.

## Current Search Implementation Summary

The search system currently searches:
- Card titles and descriptions
- Label names

Key files:
- `src/db.ts`: `searchCards()` function (lines 1083-1171) performs the database search
- `src/routes.ts`: Search API endpoint at `/api/boards/:boardId/search` (lines 828-855)
- `src/cli-search.ts`: CLI search command
- `src/ui/api.ts`: Frontend API client with `searchBoard()` function

## Implementation Requirements

### 1. Modify `src/db.ts`

Update the `searchCards` function to also search artifact content:

1. **Update the CardSearchResult type** to include artifact matches:
```typescript
export interface CardSearchResult extends CardRow {
  column_title: string;
  labels: Label[];
  artifact_matches?: Array<{
    filename: string;
    match_context: string;  // Extract ~50 chars around the match with the match highlighted
  }>;
}
```

2. **Enhance the SQL query** to search artifacts:
   - Join the artifacts table
   - Search in both `artifacts.filename` and `artifacts.content` fields
   - Group results by card to avoid duplicates
   - For each card that has artifact matches, include the matching artifacts in `artifact_matches`
   - Use SQL string functions to extract context around matches in artifact content
   - Ensure board-level artifacts (where card_id IS NULL) are also included in results with appropriate card info

### 2. Update CLI Output (`src/cli-search.ts`)

Modify the output formatting to show artifact matches:
- When a card has artifact matches, show them indented under the card
- Format: `  📎 {filename}: ...{match context}...`
- In JSON output, include the `artifact_matches` array

### 3. Update API Types (`src/ui/api.ts`)

Update the `SearchCard` interface to include artifact matches:
```typescript
export interface SearchCard extends BoardCard {
  column_title: string;
  artifact_matches?: Array<{
    filename: string;
    match_context: string;
  }>;
}
```

### 4. Write Tests

Add comprehensive tests in `src/db.test.ts`:
- Test searching for text that appears only in artifact content
- Test searching for artifact filenames
- Test that cards with matching artifacts include the artifact_matches array
- Test board-level artifact search results
- Test match context extraction
- Test that searches without artifact matches don't include empty arrays

Add CLI tests in `src/cli-search.test.ts`:
- Test artifact match display in both text and JSON output
- Test formatting of artifact results

## Technical Notes

1. **Performance**: Use appropriate SQL indexes and consider limiting artifact content search to the first N characters if performance is a concern
2. **Match Context**: Extract approximately 50 characters around the match, with the matching term in the middle
3. **Case Sensitivity**: All searches should be case-insensitive
4. **Board-Level Artifacts**: When a board-level artifact matches, it should appear with a special indicator since it's not associated with a specific card

## Expected Output Examples

CLI text output:
```
[1234] Fix login bug                     TODO        Homepage, Backend
  📎 bug-analysis.md: ...the authentication flow has a race condition when...
  📎 steps-to-reproduce.txt: ...login with test@example.com...

[5678] Update API docs                   IN PROGRESS Documentation
  📎 api-spec.yaml: ...endpoint: /auth/login...
```

JSON output should include:
```json
{
  "id": "1234",
  "title": "Fix login bug",
  "artifact_matches": [
    {
      "filename": "bug-analysis.md",
      "match_context": "...the authentication flow has a race condition when..."
    }
  ]
}
```

## Implementation Order

1. First update the database types and search function
2. Write and run tests to verify the database changes work
3. Update the CLI output formatting
4. Update the API types
5. Run all tests to ensure everything works together

Make sure all tests pass before completing the implementation.