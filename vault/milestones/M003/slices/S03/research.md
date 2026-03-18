# S03 Research

- Treat `.supercodex/temp/runtime/` as adapter scratch space and `.supercodex/runs/` as the durable audit record.
- Persist references rather than duplicate large raw outputs when the source artifact is already stable on disk.
- Capture enough run metadata now that Phase 6 can add reconciliation without changing the basic record shape.
