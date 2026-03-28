# Unattended Mode Timeout Handling

## Choice
When `bunx claude -p` times out, proceed with interactive implementation rather than retrying.

## Alternatives
1. Retry with simplified prompt
2. Break task into smaller chunks
3. Increase timeout limit

## Rationale
- Time efficiency: Direct implementation is faster than debugging timeout issues
- Reliability: Interactive mode gives immediate feedback
- Progress: Keeps feature development moving forward
- The timeout suggests the task may be too complex for unattended mode

## When to Apply
When unattended mode times out after 2 minutes with no output.

## Confidence
verified