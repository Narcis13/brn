---
title: Testing Strategy
type: testing
created: 2026-03-18
updated: 2026-03-18
updated_by: human
tags: [testing, tdd, strategy, core]
related: [[patterns/typescript]], [[architecture/overview]]
---

## Summary
Testing strategy for SUPER_CLAUDE: what to test, at which layer, and how. TDD (Red-Green-Refactor) is mechanically enforced by the orchestrator.

## The TDD Cycle

Every implementation task follows this cycle — no exceptions:

1. **RED** — Write failing tests that encode the requirement
2. **GREEN** — Write minimum code to make tests pass
3. **REFACTOR** — Clean up without breaking tests
4. **VERIFY** — Full suite + type-check + static verification

## Test Layers

| Layer | Tool | Focus | Speed Target |
|---|---|---|---|
| Unit | `bun test` | Pure functions, utilities, business logic | < 1s |
| Component | React Testing Library / RNTL | Component behavior (not snapshots) | < 5s |
| Integration | `bun test` + real DB/API | API endpoints, data flow | < 10s |
| E2E | Playwright (web) / Detox (mobile) | User flows, critical paths | < 60s |

## What Every RED Phase Must Cover

1. **Happy path** — Normal expected behavior
2. **Edge cases** — Boundaries, empty inputs, max values
3. **Error cases** — Invalid input, missing data, failures
4. **Integration points** — The "key links" from must-haves

## Test File Conventions

- Co-located: `foo.test.ts` next to `foo.ts`
- Integration tests: `foo.integration.test.ts`
- E2E tests: `__tests__/e2e/feature.e2e.test.ts`

## Testing Patterns

### Use Temp Directories for I/O Tests
```typescript
const TEST_ROOT = "/tmp/superclaude-test-<module>";

beforeEach(() => {
  mkdirSync(`${TEST_ROOT}/.superclaude/...`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});
```

### Test Data Immutability
Functions that transform state should be pure — return new objects, don't mutate.

### Test Roundtrips
For any write/read pair, always test the roundtrip:
```typescript
test("write and load roundtrip", async () => {
  await writeData(TEST_ROOT, data);
  const loaded = await loadData(TEST_ROOT, id);
  expect(loaded).toEqual(data);
});
```

## Anti-Patterns
- Snapshot tests for behavior — test behavior explicitly
- Mocking internal modules — only mock external boundaries
- Tests that depend on execution order — each test must be independent
- Skipping TDD RED phase — the orchestrator will catch this
