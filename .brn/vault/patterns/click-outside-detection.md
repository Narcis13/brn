# Pattern: Click-Outside Detection for Dismissible UI

## Approach
Use a mousedown event listener on document to detect clicks outside a component, typically for dismissing popovers, dropdowns, or modals.

## Example
```typescript
useEffect(() => {
  if (!show) return;
  
  function handleClickOutside(event: MouseEvent): void {
    if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
      onClose();
    }
  }
  
  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, [show, onClose]);
```

## When to Use
- Dismissible popovers
- Dropdown menus
- Modal dialogs (as secondary dismiss method)
- Any UI that should close when user clicks elsewhere

## Why mousedown instead of click?
- More responsive - fires immediately on press
- Prevents issues with drag operations
- Matches native UI behavior

## Confidence
verified - Used successfully in QuickCreatePopover and other UI components