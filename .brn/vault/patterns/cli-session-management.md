# CLI Session Management Pattern

## Approach
Store CLI sessions as JSON files in user's home directory (`~/.appname/config.json`). Validate session completeness when loading to handle partial/corrupted files.

## Example
```typescript
interface TaktConfig {
  userId: string;
  username: string;
  dbPath: string;
}

export async function loadSession(): Promise<TaktConfig | null> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (!(await file.exists())) return null;
    const config = await file.json();
    // Validate all required fields exist
    if (!config.userId || !config.username || !config.dbPath) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}
```

## When to Use
- CLI tools that need persistent user sessions across invocations
- When you need to store authentication state without a running server
- Apps that operate on local databases and need to remember DB paths

## Confidence: verified