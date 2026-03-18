# M001: Vault and State Engine

## Objective

Turn the Phase 0 scaffold into a real Phase 1 control plane with durable project memory, validated state files, a transition journal, queue and lock protocols, and a usable CLI.

## Why Now

Every later milestone depends on trustworthy disk-backed state. Without that foundation, runtime adapters and autonomous execution would be fragile and opaque.

## Exit Criteria

- The vault contains real project vision, roadmap, decisions, assumptions, and milestone artifacts.
- `.supercodex/state/` is schema-validated and explains current state from disk alone.
- Queue and lock behavior are deterministic and file-backed.
- Operators can use the CLI to init, reconcile, inspect, transition, queue, and lock the system.
