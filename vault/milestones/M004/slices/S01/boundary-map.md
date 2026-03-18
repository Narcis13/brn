# S01 Boundary Map

## Produces

- Shared planning unit parsing and modern-slice detection
- Task-file section parsing and validation
- Planning validation results that can drive queue decisions

## Consumes

- `SUPER_CODEX.md`
- `vault/milestones/M004/`
- Existing queue and state schemas

## Contracts

- Task files must expose objective, acceptance criteria, TDD mode, dependencies, and verification plan as explicit markdown sections.
- Modern planning rules apply to `M004+` slices and any older slice that opts in with modern artifacts.
