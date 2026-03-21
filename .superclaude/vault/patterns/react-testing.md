---
title: React Testing Patterns
type: pattern
created: 2026-03-21
updated_by: evolver
tags: [patterns, testing, react, frontend]
related: [[testing/strategy]]
---

## Summary
Patterns for testing React components and hooks effectively, avoiding common anti-patterns.

## Pattern

### Test User Behavior, Not Implementation
Test what users see and do, not how the code works internally.

```typescript
// BAD - Testing implementation details
test('calls setState', () => {
  const setState = vi.fn();
  // ...
  expect(setState).toHaveBeenCalledWith({...});
});

// GOOD - Testing user behavior
test('displays error message when login fails', async () => {
  render(<Login />);
  userEvent.type(screen.getByLabelText('Email'), 'bad@email');
  userEvent.click(screen.getByRole('button', { name: 'Login' }));
  
  await waitFor(() => {
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });
});
```

### Use React Testing Library Queries
Prefer queries that match how users interact with the UI.

```typescript
// Priority order:
1. getByRole('button', { name: 'Submit' })
2. getByLabelText('Email')  
3. getByPlaceholderText('Enter email')
4. getByText('Welcome')
5. getByTestId('custom-element') // last resort
```

### Test Hooks with renderHook
Don't manually manipulate hook state - use renderHook utility.

```typescript
// BAD
const hook = useDragDrop(cards, moveCard);
hook.draggedCard = card; // Manually setting state

// GOOD
const { result } = renderHook(() => useDragDrop(cards, moveCard));
act(() => {
  result.current.handleDragStart(card);
});
expect(result.current.draggedCard).toBe(card);
```

### Cleanup Between Tests
Always cleanup to prevent test pollution.

```typescript
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup(); // Unmounts React trees
  vi.clearAllMocks(); // Clears mock state
});
```

## When to Use
- All React component tests
- All React hook tests
- Integration tests involving React

## Anti-Patterns
- Testing mock function calls instead of UI behavior
- Using querySelector or other DOM methods
- Not waiting for async updates with waitFor
- Snapshot tests for component behavior
- Not cleaning up between tests