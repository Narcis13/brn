---
title: TypeScript Conventions
type: pattern
created: 2026-03-18
updated: 2026-03-18
updated_by: human
tags: [typescript, patterns, strict-mode, core]
related: [[architecture/overview]], [[testing/strategy]]
---

## Summary
TypeScript strict mode conventions for all code in this project. No exceptions.

## Pattern

### Strict Mode
All TypeScript files must compile under strict mode. The `tsconfig.json` has `"strict": true`.

### No `any` Types
Never use `any`. Use explicit types, `unknown` with type guards, or generics.

```typescript
// BAD
function parse(data: any): any { ... }

// GOOD
function parse(data: unknown): ParseResult { ... }
```

### Explicit Return Types
All exported functions must have explicit return types.

```typescript
// BAD
export function createSession(id: string) { ... }

// GOOD
export function createSession(id: string): SessionReport { ... }
```

### Prefer `Bun.file()` Over `node:fs`
Use Bun's native file API for all file operations in the orchestrator.

```typescript
// BAD
import { readFileSync } from "node:fs";
const content = readFileSync(path, "utf-8");

// GOOD
const content = await Bun.file(path).text();
```

### Use `Bun.$` for Shell Commands
Prefer Bun's shell template literal over `child_process`.

```typescript
// BAD
import { execSync } from "node:child_process";
execSync("git status");

// GOOD
await Bun.$`git status`;
```

### Type Imports
Use `import type` for type-only imports.

```typescript
// BAD
import { ProjectState } from "./types.ts";

// GOOD
import type { ProjectState } from "./types.ts";
```

## When to Use
Every TypeScript file in this project.

## Anti-Patterns
- `as any` casts — never
- `@ts-ignore` / `@ts-expect-error` — never (fix the type instead)
- Implicit `any` from untyped libraries — add type declarations
- Object spread without type annotation — always annotate the result type
