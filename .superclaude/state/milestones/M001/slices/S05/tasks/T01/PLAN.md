---
task: T01
slice: S05
milestone: M001
status: pending
---

## Goal
App Layout & Navigation Header

---
strategy: test-after
complexity: standard
---
**Goal:** Create app-wide layout wrapper with navigation header showing user info and logout

#### TDD Sequence
- Test file(s): playground/src/client/components/layout/AppLayout.test.tsx
- Test cases: renders header with app title, displays user email, logout button calls auth context logout, children render in main content area
- Implementation file(s): playground/src/client/components/layout/AppLayout.tsx

#### Must-Haves
**Truths:** 
- Header displays app title "Kanban Board"
- Shows current user email from auth context
- Logout button calls logout from auth context and navigates to login
- Wraps child content in consistent layout container

**Artifacts:** 
- playground/src/client/components/layout/AppLayout.tsx — layout component, 80+ lines, exports AppLayout
- playground/src/client/components/layout/AppLayout.test.tsx — test file, 60+ lines

**Key Links:** 
- AppLayout imports useAuth from contexts/AuthContext.tsx
- AppLayout receives navigateTo function as prop
- App.tsx wraps authenticated views with AppLayout

#### Must-NOT-Haves
- Do not implement routing library (keep manual navigation)
- Do not add user profile features beyond email display
- Do not add theme switching or preferences
- Do not implement responsive mobile menu
