---
slice: S05
milestone: M001
type: uat
---

# S05: UI Polish & Error Handling — Acceptance Test Script

## Prerequisites

```bash
# From repo root — ensure dependencies installed
cd playground && bun install

# Confirm all slice tests pass before UAT
bun test --filter "AppLayout|BoardHeader|EmptyState|LoadingSpinner|Toast|client"
# Expected: 87 tests, 0 failures
```

---

## ⚠️ Frontend Servability Status

> **MUST-FIX GAP**: The playground is a Vite/React frontend. Serving it for browser-based UAT requires a running dev server. The slice did not wire up or verify HTTP servability. Before executing browser UAT steps below, confirm the dev server starts:
>
> ```bash
> cd playground && bun run dev
> # Expected: server listening on http://localhost:5173 (or similar)
> # Verify: curl -s http://localhost:5173 | head -5  →  should return HTML with <html>
> ```
>
> If `bun run dev` is not configured, check `playground/package.json` → `scripts.dev`. If missing, this is a blocker for all browser-based verification below.

---

## T01 — App Layout & Navigation Header

### Automated (unit tests)
```bash
cd playground && bun test --filter "AppLayout"
# Expected: 6 tests pass
# Covers: header title, user email display, logout button, children rendering
```

### Manual (browser)
1. Start dev server: `cd playground && bun run dev`
2. Open `http://localhost:5173` in a browser
3. Log in with valid credentials
4. **Verify:** Page header shows "Kanban Board" title
5. **Verify:** Logged-in user's email appears in the header
6. **Verify:** "Logout" button is visible in the header
7. Click "Logout"
8. **Verify:** User is redirected to the login screen (auth state cleared)
9. Log back in
10. **Verify:** Board list (or main content) renders below the header

---

## T02 — Board Navigation & Header Actions

### Automated (unit tests)
```bash
cd playground && bun test --filter "BoardHeader"
# Expected: 15 tests pass
# Covers: back navigation, edit mode toggle, save, cancel, Escape key
```

### Manual (browser)
1. From the board list, click any board to open it
2. **Verify:** A back button (← or "Back") is visible in the board header
3. Click the back button
4. **Verify:** Returns to the board list view
5. Open a board again
6. Click the board name in the header
7. **Verify:** The board name becomes an editable input field
8. Change the name to "UAT Test Board"
9. Click "Save" (or equivalent)
10. **Verify:** Header now shows "UAT Test Board"
11. **Verify:** Change persisted — reload the page and confirm the new name still shows
12. Click the board name again to enter edit mode
13. Change the name to something else, then press **Escape**
14. **Verify:** The original name "UAT Test Board" is restored (edit cancelled)
15. Enter edit mode again, change name, then click "Cancel"
16. **Verify:** Original name is restored

---

## T03 — Empty States & Loading Improvements

### Automated (unit tests)
```bash
cd playground && bun test --filter "EmptyState|LoadingSpinner"
# Expected: 21 tests pass (12 EmptyState + 9 LoadingSpinner)
```

### Manual (browser)

**Empty board list:**
1. Create a fresh account (or delete all boards from an existing account)
2. Navigate to the board list
3. **Verify:** An empty state is shown — should include an icon, a title, a message, and an action button (e.g., "Create your first board")
4. **Verify:** No raw text "No boards" or placeholder `null` render

**Empty column:**
1. Open a board and create a new column (add no cards to it)
2. **Verify:** The empty column shows an empty state component — icon + message (e.g., "No cards yet")
3. **Verify:** No blank white space or missing UI

**Loading spinner:**
1. Open browser DevTools → Network → throttle to "Slow 3G"
2. Navigate to the board list
3. **Verify:** A loading spinner appears while boards are fetched
4. **Verify:** The spinner disappears once boards load (replaced by board list or empty state)
5. Reset network throttling

---

## T04 — API Error Handling & Token Expiration

### Automated (unit tests)
```bash
cd playground && bun test --filter "client"
# Expected: 18 tests pass
# Covers: token injection, 401 auto-logout, network errors, ApiError class
```

### Manual (browser — 401 / token expiration)
1. Log in to the app
2. Open browser DevTools → Application → Local Storage (or Cookies)
3. Find the stored JWT token and **delete it** or corrupt its value
4. Perform any board action (e.g., create a board, rename a board)
5. **Verify:** The app automatically logs out and redirects to the login screen
6. **Verify:** No unhandled JS errors in the console

### Manual (browser — network error)
1. Open browser DevTools → Network → check "Offline"
2. Perform any board action
3. **Verify:** A user-friendly error message appears (not a raw JS exception or blank screen)
4. Uncheck "Offline"

---

## T05 — Toast Notifications System

### Automated (unit tests)
```bash
cd playground && bun test --filter "Toast|ToastContext"
# Expected: 27 tests pass (12 Toast + 15 ToastContext)
# Covers: appear/disappear, stacking, auto-dismiss, manual dismiss
```

### Manual (browser)

**Success toast:**
1. Log in and navigate to a board
2. Create a new card
3. **Verify:** A green success toast appears (e.g., "Card created")
4. **Verify:** The toast disappears automatically after ~3 seconds

**Error toast:**
1. Trigger an API error (e.g., throttle network, attempt an action)
2. **Verify:** A red error toast appears with a descriptive message
3. **Verify:** Toast is visible for ~3 seconds then auto-dismisses

**Manual dismiss:**
1. Trigger a success or error toast
2. Click the dismiss (×) button on the toast before auto-dismiss
3. **Verify:** Toast disappears immediately on click

**Toast stacking:**
1. Rapidly perform multiple create operations (e.g., create 3 cards quickly)
2. **Verify:** Multiple toasts appear stacked vertically
3. **Verify:** They each auto-dismiss independently (not all at once)

---

## Full Regression

```bash
# Run all S05 tests together
cd playground && bun test --filter "AppLayout|BoardHeader|EmptyState|LoadingSpinner|Toast|ToastContext|client"

# Run full test suite to confirm no regressions
cd playground && bun test
```

**Expected:** All tests pass, no regressions in previously passing suites.
