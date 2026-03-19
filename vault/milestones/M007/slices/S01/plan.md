# S01 Plan

- Add worker and parallel state schemas plus queue-status extensions for active integration pipelines.
- Claim only ready task units with satisfied dependencies, explicit likely files, and non-empty regression commands.
- Persist one worker file per active task and acquire one resource lock per owned file.
