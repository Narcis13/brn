# Project Templates

Each template defines columns (in order) and a default label set with hex colors.

## Table of Contents

- [kanban](#kanban)
- [sprint](#sprint)
- [gtd](#gtd)
- [roadmap](#roadmap)
- [simple](#simple)
- [bug-tracker](#bug-tracker)
- [custom](#custom)

---

## kanban

General-purpose kanban board for continuous flow work.

**Columns** (in order):
1. Backlog
2. To Do
3. In Progress
4. Review
5. Done

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| Feature | `#1f6feb` | New functionality |
| Bug | `#d73a49` | Defects and fixes |
| Improvement | `#6f42c1` | Enhancements to existing features |
| Docs | `#0075ca` | Documentation tasks |
| Chore | `#6a737d` | Maintenance, config, cleanup |
| Urgent | `#ff0000` | Time-sensitive items |

---

## sprint

Time-boxed sprint workflow with explicit testing phase.

**Columns** (in order):
1. Sprint Backlog
2. In Progress
3. Review
4. Testing
5. Done

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| Feature | `#1f6feb` | User stories and features |
| Bug | `#d73a49` | Defects |
| Tech Debt | `#e36209` | Refactoring and cleanup |
| Spike | `#6f42c1` | Research and investigation |
| Blocked | `#b60205` | Items waiting on external dependency |
| Quick Win | `#28a745` | Small, high-value items |

---

## gtd

Getting Things Done methodology board.

**Columns** (in order):
1. Inbox
2. Next Actions
3. Waiting For
4. Someday/Maybe
5. Done

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| Work | `#1f6feb` | Professional tasks |
| Personal | `#28a745` | Personal tasks |
| High Energy | `#d73a49` | Requires focus and energy |
| Low Energy | `#6a737d` | Can do when tired |
| Quick (2min) | `#e36209` | Two-minute rule candidates |
| Delegated | `#6f42c1` | Handed off to someone else |

---

## roadmap

Product roadmap and planning board.

**Columns** (in order):
1. Ideas
2. Planned
3. In Progress
4. Shipped

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| Must Have | `#d73a49` | Critical for release |
| Should Have | `#e36209` | Important but not blocking |
| Nice to Have | `#28a745` | Desirable if time permits |
| Won't Do | `#6a737d` | Explicitly descoped |
| Q1 | `#1f6feb` | Quarter 1 target |
| Q2 | `#6f42c1` | Quarter 2 target |

---

## simple

Minimal three-column board for quick projects.

**Columns** (in order):
1. To Do
2. Doing
3. Done

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| High | `#d73a49` | High priority |
| Medium | `#e36209` | Medium priority |
| Low | `#28a745` | Low priority |

---

## bug-tracker

Issue tracking workflow with triage stage.

**Columns** (in order):
1. Reported
2. Triaging
3. In Progress
4. Fixed
5. Verified

**Labels**:
| Name | Color | Use for |
|------|-------|---------|
| Critical | `#b60205` | System down, data loss |
| Major | `#d73a49` | Broken feature, no workaround |
| Minor | `#e36209` | Broken feature, workaround exists |
| Cosmetic | `#6a737d` | Visual or UX nit |
| Regression | `#6f42c1` | Was working, now broken |
| Security | `#ff0000` | Security vulnerability |

---

## custom

No predefined columns or labels. Ask the user for:
1. Column names (in order)
2. Label names and colors (optional)

Suggest reasonable defaults based on the project description if the user is unsure.
