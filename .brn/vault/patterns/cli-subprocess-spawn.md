# CLI Subprocess Spawning Pattern

## Approach
When spawning subprocesses from a Bun CLI tool, use Bun's native spawn API with environment variable passing and output inheritance.

## Example
```typescript
const { spawn } = await import('bun');
const proc = spawn(['bun', 'run', 'script.ts'], {
  env: { ...process.env, PORT: port.toString() },
  stdout: 'inherit',
  stderr: 'inherit',
});
await proc.exited;
```

## When to Use
- Launching long-running processes from CLI commands
- Running server processes that need to remain attached to terminal
- Passing environment variables to child processes
- Maintaining stdout/stderr connection for real-time output

## Confidence: verified