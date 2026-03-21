---
slice: S05
milestone: M001
status: planned
---

## Tasks

### T01: App Layout & Navigation Header
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
- Logout button calls logout from auth context
- Wraps child content in consistent layout container

**Artifacts:** 
- playground/src/client/components/layout/AppLayout.tsx — layout component, 80+ lines, exports AppLayout
- playground/src/client/components/layout/AppLayout.test.tsx — test file, 60+ lines

**Key Links:** 
- AppLayout imports useAuth from playground/src/client/contexts/AuthContext.tsx
- AppLayout receives navigateTo function as prop
- App.tsx wraps authenticated views with AppLayout

#### Must-NOT-Haves
- Do not implement routing library (keep manual navigation)
- Do not add user profile features beyond email display
- Do not add theme switching or preferences
- Do not implement responsive mobile menu

### T02: Board Navigation & Header Actions
---
strategy: tdd-strict
complexity: simple
---
**Goal:** Add back navigation to BoardView and board name editing to board header

#### TDD Sequence
- Test file(s): playground/src/client/components/board/BoardHeader.test.tsx
- Test cases: renders board name, back button calls navigation, edit mode toggles on click, save updates board name, cancel restores original name
- Implementation file(s): playground/src/client/components/board/BoardHeader.tsx

#### Must-Haves
**Truths:**
- Back button navigates from board view to boards list
- Board name becomes editable on click
- Save button updates board name via API
- Cancel button restores original name
- Escape key cancels editing

**Artifacts:**
- playground/src/client/components/board/BoardHeader.tsx — board header component, 100+ lines, exports BoardHeader
- playground/src/client/components/board/BoardHeader.test.tsx — test file, 80+ lines

**Key Links:**
- BoardHeader imports updateBoard from playground/src/client/api/boards.ts
- BoardView imports and uses BoardHeader
- BoardHeader receives board, onBack, and onBoardUpdate props

#### Must-NOT-Haves
- Do not add board sharing or permissions
- Do not add board settings beyond name
- Do not implement board duplication
- Do not add board color/icon customization

### T03: Empty States & Loading Improvements
---
strategy: test-after
complexity: simple
---
**Goal:** Create reusable empty state components and improve loading feedback

#### TDD Sequence
- Test file(s): playground/src/client/components/common/EmptyState.test.tsx, playground/src/client/components/common/LoadingSpinner.test.tsx
- Test cases: empty state renders icon/title/message/action, loading spinner shows animation, components accept custom styles
- Implementation file(s): playground/src/client/components/common/EmptyState.tsx, playground/src/client/components/common/LoadingSpinner.tsx

#### Must-Haves
**Truths:**
- EmptyState shows icon, title, message, and optional action button
- LoadingSpinner provides consistent loading animation
- BoardList uses EmptyState when no boards exist
- Column uses EmptyState when no cards exist

**Artifacts:**
- playground/src/client/components/common/EmptyState.tsx — empty state component, 50+ lines, exports EmptyState
- playground/src/client/components/common/LoadingSpinner.tsx — loading component, 30+ lines, exports LoadingSpinner
- playground/src/client/components/common/EmptyState.test.tsx — test file, 40+ lines
- playground/src/client/components/common/LoadingSpinner.test.tsx — test file, 30+ lines

**Key Links:**
- BoardList imports and uses EmptyState
- Column imports and uses EmptyState for empty columns
- Components use LoadingSpinner instead of text "Loading..."

#### Must-NOT-Haves
- Do not create complex animations
- Do not add illustration assets
- Do not implement skeleton loaders
- Do not add progress indicators

### T04: API Error Handling & Token Expiration
---
strategy: tdd-strict
complexity: complex
---
**Goal:** Add centralized API error handling with automatic logout on token expiration

#### TDD Sequence
- Test file(s): playground/src/client/api/client.test.ts
- Test cases: API client handles 401 responses, calls logout on token expiration, retries failed requests, shows user-friendly error messages
- Implementation file(s): playground/src/client/api/client.ts

#### Must-Haves
**Truths:**
- All API calls go through centralized client
- 401 responses trigger automatic logout
- Network errors show user-friendly messages
- Failed requests can be retried
- Token is included in all authenticated requests

**Artifacts:**
- playground/src/client/api/client.ts — API client with error handling, 100+ lines, exports apiClient
- playground/src/client/api/client.test.ts — test file, 80+ lines

**Key Links:**
- All playground/src/client/api/*.ts files import and use apiClient
- apiClient imports getToken and clearToken from playground/src/client/api/auth.ts
- Error handler accesses auth context for logout

#### Must-NOT-Haves
- Do not implement request queuing
- Do not add offline support
- Do not implement request caching
- Do not add retry with exponential backoff

### T05: Toast Notifications System
---
strategy: test-after
complexity: standard
---
**Goal:** Create toast notification system for success/error feedback

#### TDD Sequence
- Test file(s): playground/src/client/components/common/Toast.test.tsx, playground/src/client/contexts/ToastContext.test.tsx
- Test cases: toast appears/disappears, multiple toasts stack, auto-dismiss after timeout, manual dismiss on click
- Implementation file(s): playground/src/client/components/common/Toast.tsx, playground/src/client/contexts/ToastContext.tsx

#### Must-Haves
**Truths:**
- ToastContext provides showSuccess, showError, showInfo methods
- Toasts auto-dismiss after 3 seconds
- Multiple toasts stack vertically
- Manual dismiss on click
- Success messages show on create/update/delete operations

**Artifacts:**
- playground/src/client/components/common/Toast.tsx — toast component, 60+ lines, exports Toast
- playground/src/client/contexts/ToastContext.tsx — toast context, 80+ lines, exports ToastProvider, useToast
- playground/src/client/components/common/Toast.test.tsx — test file, 50+ lines
- playground/src/client/contexts/ToastContext.test.tsx — test file, 60+ lines

**Key Links:**
- App.tsx wraps with ToastProvider
- Card operations use toast for success feedback
- API error handler uses toast for error display

#### Must-NOT-Haves
- Do not add toast persistence
- Do not implement toast actions beyond dismiss
- Do not add sound notifications
- Do not create toast queue management
EOF < /dev/null