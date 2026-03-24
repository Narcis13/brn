# Calendar Data Structure

**Choice**: Return enriched card objects with labels and checklist counts in calendar endpoint

**Alternatives considered**:
1. Return minimal cards with just dates and IDs
2. Reuse exact BoardCard structure from columns endpoint
3. Create custom CalendarCardResult with calculated fields

**Rationale**:
- Calendar UI needs labels for visual color coding
- Checklist counts show task progress at a glance
- Column title provides context without fetching all columns
- Same rich data as board view maintains consistency
- Avoids N+1 queries by batching label lookups
- Calculated fields (checklist_total/done) prevent client-side JSON parsing

**Trade-offs**:
- Slightly larger payload vs simpler client code
- More complex query vs better performance (single round trip)

**Confidence**: verified