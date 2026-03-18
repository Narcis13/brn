# S02 Plan

- Define JSON schemas for `current.json`, `queue.json`, lock records, and transition records.
- Enforce schema validation on reads and writes.
- Append phase transitions to `transitions.jsonl` before rewriting `current.json`.
