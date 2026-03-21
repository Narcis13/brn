---
task: T01
slice: S04
milestone: M001
status: pending
---

## Goal
React Foundation & Routing

---
strategy: verify-only
complexity: simple
---
**Goal:** Set up React application foundation with basic routing structure

#### TDD Sequence
- Test file(s): N/A (infrastructure setup)
- Test cases: N/A
- Implementation file(s): 
  - playground/public/index.html
  - playground/src/client/index.tsx
  - playground/src/client/App.tsx
  - playground/src/client/types.ts

#### Must-Haves
**Truths:** 
- React app renders in browser at localhost:3000
- Basic routing structure exists for auth and board views
- TypeScript types mirror backend types for frontend use

**Artifacts:**
- playground/public/index.html — HTML entry point, 15+ lines, div#root mount point
- playground/src/client/index.tsx — React entry point, 10+ lines, renders App
- playground/src/client/App.tsx — Main app component, 20+ lines, basic routing
- playground/src/client/types.ts — Frontend type definitions, 40+ lines, User/Board/Card interfaces

**Key Links:**
- index.tsx imports ReactDOM and App component
- App.tsx uses React Router (or simple state-based routing)
- types.ts mirrors backend types from playground/src/types.ts

#### Must-NOT-Haves
- No actual API calls yet (just routing shell)
- No authentication logic implementation
- No styling or CSS frameworks
- No external UI libraries beyond React
