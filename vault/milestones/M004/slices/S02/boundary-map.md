# S02 Boundary Map

## Produces

- Planning-aware CLI commands
- Next-action routing for strategist and slice-planner roles
- Success-state handling that returns planning units to `plan`

## Consumes

- Phase 3 next-action synthesis and canonical run persistence
- Phase 4 planning validation and queue synchronization
- Modern milestone and slice artifacts under `vault/milestones/M004/`

## Contracts

- Planning runs must update the queue before claiming success.
- A planning unit that reports success but leaves invalid artifacts must transition to recovery.
- Legacy slice units keep the existing implementer path unless they opt into modern planning artifacts.
