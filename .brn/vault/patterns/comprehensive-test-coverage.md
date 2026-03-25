# Pattern: Comprehensive Test Coverage

**Approach**: Write tests for all acceptance criteria, even when functionality is already implemented

**Example**: 
In the calendar-view feature, navigation functions were already fully implemented, but AC14 wasn't marked as complete because there were no explicit tests. Adding comprehensive tests confirmed the functionality worked correctly.

```typescript
describe("Navigation (AC14)", () => {
  it("should navigate to Today for both month and week views", () => {
    // Test implementation
  });
  
  it("should navigate to previous/next week correctly", () => {
    // Test across boundaries
  });
});
```

**When to use**: 
- Always write tests for every acceptance criterion
- Even if functionality appears to be working, tests provide verification
- Tests serve as documentation of expected behavior

**Confidence**: verified