# M004 UAT

1. Run `supercodex plan validate --unit M004/S01` and confirm the slice validates cleanly.
2. Set the active milestone to `M004`, clear unrelated queue items, and run `supercodex plan sync`.
3. Confirm the queue contains `task` units for valid modern slices and that the first ready task is deterministic.
4. Remove a task file from a modern slice, rerun `supercodex plan sync`, and confirm the slice becomes the next planning unit instead of a task.
