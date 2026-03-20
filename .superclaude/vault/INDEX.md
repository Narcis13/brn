---
title: Vault Index
type: index
created: 2026-03-18
updated: 2026-03-20
updated_by: evolver
---

# Vault — Map of Content

The vault is the system's long-term memory. Agents read from and write to these docs.

## Architecture
- [[architecture/overview]] — System architecture overview and key design decisions

## Patterns
- [[patterns/typescript]] — TypeScript conventions: strict mode, no any, explicit types
- [[patterns/position-management]] — Managing ordered positions within collections
- [[patterns/database-indexes]] — Essential indexes for query performance

## Testing
- [[testing/strategy]] — Testing strategy: what to test, at which layer, and how

## Decisions
- [[decisions/ADR-001-fixed-columns]] — Fixed columns vs dynamic lists for Kanban boards
- [[decisions/ADR-002-authorization-pattern]] — Authorization result pattern for proper HTTP status codes

## Learnings
- [[learnings/database-test-isolation]] — Each test file must create its own isolated database
- [[learnings/schema-code-alignment]] — Database schema and code must use consistent naming
- [[learnings/explicit-return-types]] — All exported functions require explicit return types
- [[learnings/test-coverage-gaps]] — Every public function needs tests, especially auth paths

## Playbooks
- [[playbooks/test-failure-recovery]] — Recovering from test failures in suite vs individual runs

## Contracts
- [[contracts/S03]] — Card Operations boundary contract