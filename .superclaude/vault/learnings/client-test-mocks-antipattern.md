---
title: Client Test Mocks Anti-Pattern
type: learning
source: M001/S04
tags: [testing, react, frontend, mocks]
---

## Problem
Client-side tests were testing mock implementations instead of actual component behavior, resulting in false confidence.

## Root Cause
Tests were asserting that mock functions got called rather than testing what the user experiences in the UI.

## Fix
Use React Testing Library to render components and test actual user interactions, DOM states, and API integration.

## Example
```typescript
// BAD
test('calls login function', () => {
  const mockLogin = vi.fn();
  expect(mockLogin).toHaveBeenCalled();
});

// GOOD
test('logs user in when form submitted', async () => {
  const { getByRole } = render(<Login />);
  fireEvent.click(getByRole('button', { name: 'Login' }));
  await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
});
```