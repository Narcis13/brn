---
title: Vault Index
type: index
created: 2026-03-18
updated: 2026-03-21
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
- [[patterns/react-testing]] — React component and hook testing patterns

## Testing
- [[testing/strategy]] — Testing strategy: what to test, at which layer, and how

## Decisions
- [[decisions/ADR-001-fixed-columns]] — Fixed columns vs dynamic lists for Kanban boards
- [[decisions/ADR-002-authorization-pattern]] — Authorization result pattern for proper HTTP status codes
- [[decisions/ADR-003-state-based-routing]] — State-based routing vs React Router
- [[decisions/ADR-004-optimistic-ui-updates]] — Optimistic UI updates pattern

## Learnings
- [[learnings/database-test-isolation]] — Each test file must create its own isolated database
- [[learnings/schema-code-alignment]] — Database schema and code must use consistent naming
- [[learnings/explicit-return-types]] — All exported functions require explicit return types
- [[learnings/test-coverage-gaps]] — Every public function needs tests, especially auth paths
- [[learnings/client-test-mocks-antipattern]] — Tests must verify behavior, not mock calls
- [[learnings/property-name-case-mismatch]] — Frontend camelCase vs backend snake_case
- [[learnings/jwt-storage-security]] — JWT localStorage vulnerability considerations
- [[learnings/placeholder-test-implementations]] — Tests need real assertions, not placeholders
- [[learnings/missing-critical-test-coverage]] — Auth and routing need mandatory test coverage

## Playbooks
- [[playbooks/test-failure-recovery]] — Recovering from test failures in suite vs individual runs

## Contracts
- [[contracts/S03]] — Card Operations boundary contract
- [[contracts/S04]] — Frontend React Implementation boundary contract