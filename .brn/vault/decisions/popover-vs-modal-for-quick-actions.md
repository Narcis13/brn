# Decision: Popover vs Modal for Quick Actions

## Choice
Use lightweight popovers for quick actions, full modals for complex editing

## Alternatives Considered
1. Reuse CardModal for quick-create
2. Inline editing directly in calendar cells
3. Sidebar panel for creation

## Rationale
- **Speed**: Popovers are faster to render and dismiss
- **Context**: Popover appears near the action point, maintaining visual context
- **Simplicity**: Quick actions need minimal UI, not the full editing experience
- **Consistency**: Follows common calendar app patterns (Google Calendar, Outlook)

## Implementation Guidelines
**Use Popover when**:
- 1-3 input fields
- Single quick action
- Context-sensitive positioning matters
- Frequent interaction expected

**Use Modal when**:
- Multiple sections/fields
- Complex validation
- Multi-step process
- Destructive actions needing confirmation

## Confidence
verified - QuickCreatePopover provides better UX than full modal for calendar creation