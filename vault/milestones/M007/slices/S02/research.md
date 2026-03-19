# S02 Research

- Runtime adapters need an execution cwd override without relocating the canonical run artifact root.
- Verification lookups must tolerate planning artifacts that still live only in the control root.
- Completion writes should materialize task-local markdown only when the worker actually needs to update it.
