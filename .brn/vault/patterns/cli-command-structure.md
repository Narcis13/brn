# CLI Command Structure Pattern

## Approach
Organize CLI commands in separate modules with consistent interface. Each command module exports functions that take database, session, and options. Main CLI file handles command dispatch and option parsing.

## Example
```typescript
// cli-board.ts
export async function listBoards(db: Database, session: TaktConfig, options: FormatOptions): Promise<void> {
  const boards = getUserBoards(db, session.userId);
  
  if (options.json) {
    console.log(JSON.stringify(boards, null, 2));
    return;
  }
  
  // Format as table...
}

// cli.ts
async function handleBoard(subcommand: string | undefined, args: string[]): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.error('Not logged in. Run "takt auth login" first.');
    process.exit(1);
  }
  
  const options = {
    json: args.includes('--json'),
    quiet: args.includes('--quiet'),
    fullIds: args.includes('--full-ids'),
  };
  
  switch (subcommand) {
    case 'list':
      await listBoards(db, session, options);
      break;
    // ...
  }
}
```

## When to Use
- Building CLIs with multiple commands and subcommands
- When you need consistent formatting options across commands
- When commands share authentication/session requirements
- For better testability by isolating command logic from CLI parsing

## Confidence: verified