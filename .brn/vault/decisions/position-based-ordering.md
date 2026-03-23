# Position-Based Ordering for Labels

## Choice
Use integer position field for ordering labels within a board, with gap-less sequential positions starting from 0.

## Alternatives Considered
1. Timestamp-based ordering - rejected due to potential race conditions
2. Floating-point positions - rejected as overly complex for this use case
3. Linked list - rejected due to query complexity

## Rationale
- Simple to implement and understand
- Efficient queries with ORDER BY position
- Easy reordering by updating positions
- Matches pattern used for cards and columns
- Gap-less positions prevent position drift over time

## Implementation Notes
- Always maintain sequential positions (0, 1, 2...)
- When inserting/deleting, update all affected positions
- Use transactions for atomic position updates when available