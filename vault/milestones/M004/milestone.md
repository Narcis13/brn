# M004: Planning and Slice Engine

## Objective

Turn roadmap intent into milestone, slice, and task artifacts that the conductor can validate and queue deterministically.

## Why Now

Phase 3 can synthesize and dispatch the next action, but it still depends on manually curated milestone and slice docs. Phase 4 closes that gap by making structured decomposition a first-class, file-backed part of the control plane.

## Exit Criteria

- Modern milestone and slice artifacts can be validated from disk alone.
- A deterministic queue-sync step can turn valid task files into ready `task` units.
- Planning runs return to `plan` and do not masquerade as implementation completion.
- Operators can validate and synchronize planning artifacts from the CLI.
