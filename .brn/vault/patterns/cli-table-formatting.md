# CLI Table Formatting Pattern

## Approach
Format CLI output as aligned tables with consistent column widths. Calculate max widths based on data, use padding, and support multiple output formats (table, json, quiet).

## Example
```typescript
// Calculate column widths
const maxTitleLength = Math.max(...boards.map(b => b.title.length), 5);
const idLength = options.fullIds ? 21 : 8;

// Print header
console.log(`${"ID".padEnd(idLength)}  ${"Title".padEnd(maxTitleLength)}  Created`);
console.log("-".repeat(idLength + maxTitleLength + 14));

// Print rows
boards.forEach(board => {
  console.log(
    `${formatId(board.id, options).padEnd(idLength)}  ${board.title.padEnd(maxTitleLength)}  ${formatDate(board.created_at)}`
  );
});

// Support different formats
if (options.json) {
  console.log(JSON.stringify(data, null, 2));
} else if (options.quiet) {
  data.forEach(item => console.log(item.id));
} else {
  // Table format
}
```

## When to Use
- Displaying tabular data in CLI tools
- When users need both human-readable and machine-parseable output
- For consistent formatting across different commands
- Supporting both truncated and full ID display

## Confidence: verified