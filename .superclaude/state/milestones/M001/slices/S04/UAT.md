# S04: Frontend Foundation & Kanban UI - User Acceptance Tests

## Prerequisites
1. Ensure backend server is running (from S03):
   ```bash
   cd playground
   bun run dev
   ```

2. In a new terminal, start the frontend dev server:
   ```bash
   cd playground
   bun run dev:client
   ```

3. Open browser to http://localhost:3000

## Test Scenarios

### 1. Application Bootstrap
**Goal**: Verify React app loads successfully

**Steps**:
1. Navigate to http://localhost:3000
2. Open browser DevTools console
3. Verify no console errors appear
4. Verify page shows either login form or boards list

**Expected**: 
- Clean console output
- React app renders without errors
- Router displays appropriate initial view

### 2. User Registration
**Goal**: Create a new user account

**Steps**:
1. Click "Sign Up" or navigate to signup
2. Enter test credentials:
   ```
   Email: testuser@example.com
   Password: TestPass123!
   ```
3. Click "Sign Up" button
4. Wait for redirect

**Expected**:
- Form validates email format
- Password meets requirements  
- Successful signup redirects to boards page
- User is logged in automatically

### 3. User Login
**Goal**: Authenticate existing user

**Steps**:
1. If logged in, refresh page or clear localStorage
2. On login form, enter:
   ```
   Email: testuser@example.com  
   Password: TestPass123!
   ```
3. Click "Login" button

**Expected**:
- Successful login redirects to boards
- JWT token stored (check DevTools > Application > Local Storage)
- Subsequent refreshes maintain auth state

### 4. Board Creation
**Goal**: Create a new Kanban board

**Steps**:
1. From boards list, click "Create Board" or "+" button
2. Enter board name: "Test Project Board"
3. Click "Create"

**Expected**:
- New board appears in list immediately
- Board shows name and creation timestamp
- Click on board navigates to board view

### 5. Board Management
**Goal**: View and delete boards

**Steps**:
1. Verify "Test Project Board" appears in list
2. Create another board: "Temporary Board"
3. On "Temporary Board", click delete button
4. Confirm deletion in dialog

**Expected**:
- Both boards display correctly
- Delete shows confirmation prompt
- Board disappears from list after confirmation
- No errors in console

### 6. Kanban Board View
**Goal**: Verify three-column layout

**Steps**:
1. Click on "Test Project Board"
2. Verify page shows board name at top
3. Check three columns are visible

**Expected**:
- Columns labeled: "To Do", "In Progress", "Done"
- Each column shows empty state message
- Board ID in URL (e.g., /board/123)

### 7. Card Creation - Todo Column
**Goal**: Add cards to Todo column

**Steps**:
1. In Todo column, click "Add Card" or "+"
2. Enter:
   ```
   Title: Implement user settings
   Description: Add user profile and preferences page
   ```
3. Click "Create"
4. Repeat with:
   ```
   Title: Fix navigation bug
   Description: Menu doesn't close on mobile
   ```

**Expected**:
- Cards appear immediately in Todo column
- Cards show title prominently
- Cards maintain order (newest at bottom)
- Both cards visible without refresh

### 8. Card Display & Interaction
**Goal**: Verify card information display

**Steps**:
1. Click on "Implement user settings" card
2. Verify all information displays
3. Close modal/view
4. Check both cards show correctly

**Expected**:
- Card expands to show description
- Title and description are readable
- Timestamps show creation time
- Cards have edit/delete actions

### 9. Card Editing
**Goal**: Modify existing card content

**Steps**:
1. Click edit on "Fix navigation bug" card
2. Update:
   ```
   Title: Fix navigation bug on mobile
   Description: Hamburger menu doesn't close after selection on iOS Safari
   ```
3. Save changes

**Expected**:
- Edit form pre-fills with current values
- Changes save successfully  
- Card updates immediately in UI
- No position/column changes occur

### 10. Card Movement - Drag & Drop
**Goal**: Move cards between columns

**Steps**:
1. Drag "Fix navigation bug on mobile" to "In Progress" column
2. Drag "Implement user settings" to "In Progress" column  
3. Drag "Fix navigation bug on mobile" to "Done" column

**Expected**:
- Cards highlight when dragging starts
- Drop zones indicate valid targets
- Cards move to new columns on drop
- Positions update correctly
- No flickering or jumps

### 11. Card Reordering
**Goal**: Reorder cards within column

**Steps**:
1. In "In Progress", ensure "Implement user settings" is present
2. Add new card to "In Progress":
   ```
   Title: Update documentation
   ```
3. Drag "Update documentation" above "Implement user settings"

**Expected**:
- Cards can be reordered within same column
- Visual feedback shows drop position
- Order persists on page refresh

### 12. Card Deletion
**Goal**: Remove cards from board

**Steps**:
1. On "Update documentation" card, click delete
2. Confirm deletion
3. Verify card is removed

**Expected**:
- Delete shows confirmation dialog
- Card disappears immediately
- Other cards remain in correct positions
- No errors in console

### 13. Multi-Column Operations
**Goal**: Verify complex board state

**Steps**:
1. Create cards in each column:
   - Todo: "Research competitors"
   - In Progress: (existing card)
   - Done: (existing card)
2. Drag cards between all columns
3. Refresh page

**Expected**:
- All cards remain in correct columns
- Positions are preserved
- Drag works across all columns
- State persists after refresh

### 14. Error Handling
**Goal**: Verify graceful error handling

**Steps**:
1. Open DevTools Network tab
2. Set to "Offline" mode
3. Try to create a new card
4. Set back to "Online"
5. Retry the operation

**Expected**:
- Error message displays to user
- UI doesn't break or freeze
- Can recover when connection returns
- No data loss for displayed items

### 15. Logout & Auth Protection
**Goal**: Verify authentication flow

**Steps**:
1. Find and click logout button
2. Verify redirect to login
3. Try to navigate directly to /boards
4. Login again to restore access

**Expected**:
- Logout clears auth state
- Protected routes redirect to login
- Direct URL access requires auth
- Login restores full access

## Test Data Cleanup
After testing, clean up test data:
```bash
# From playground directory
rm -rf .superclaude/state/milestones/M001/test-db.sqlite
```

## Success Criteria
- [ ] All 15 test scenarios pass
- [ ] No console errors during testing
- [ ] UI updates feel responsive (< 200ms)
- [ ] Drag and drop works smoothly
- [ ] Data persists between sessions
- [ ] Error states recover gracefully

## Common Issues & Solutions

### Frontend won't start
```bash
cd playground
bun install
bun run build:client
bun run dev:client
```

### CORS errors
Ensure backend is running on port 3001 and frontend on port 3000

### Drag not working
- Check browser supports HTML5 drag/drop
- Ensure not in mobile emulation mode
- Try different browser if issues persist

### Auth token errors
Clear localStorage and login fresh:
```javascript
// In browser console
localStorage.clear()
location.reload()
```