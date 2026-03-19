# SUPER_CODEX Spec Gap Review

Date: 2026-03-19

## Scope

This review compares the current repository implementation against the normative spec in [SUPER_CODEX.md](../SUPER_CODEX.md), with emphasis on the gaps that blocked a real end-to-end toy-project exercise.

Verification performed after the latest changes:

- `pnpm test` -> 34/34 tests passed
- `pnpm check` -> passed
- `pnpm cli doctor` -> passed in the checked-in repo on 2026-03-19
- `tests/playground.test.ts` -> passes an automated toy-project flow from intent to generated artifacts to first dispatch
- `playground/README.md` -> documents the operator-facing toy flow

## Gaps Closed

### 1. Deterministic planning artifact generation now exists

Implemented:

- `plan generate-roadmap`
- `plan generate-milestone`
- `plan generate-slice`
- `plan generate-tasks`

Impact:

- A toy project can now move from `vision.md` plus roadmap intent into milestone, slice, and task artifacts without hand-writing the whole vault tree first.
- Milestone generation can activate the new milestone and reset queue state for a clean playground flow.

### 2. Local-file human feedback is implemented as a deterministic protocol

Implemented:

- `feedback ask`
- `feedback block`
- `feedback ingest`

Impact:

- Questions, blockers, and answers now round-trip through `vault/feedback/QUESTIONS.md`, `BLOCKERS.md`, and `ANSWERS.md`.
- Human responses can deterministically move state back into recovery instead of remaining passive context.

### 3. Runtime assumptions are promoted into the durable ledger

Implemented:

- Normalized runtime-result assumptions are now appended into `vault/assumptions.md` with timestamp, scope, confidence, blast radius, and human-review flags.

Impact:

- Assumptions are no longer trapped only inside canonical run records.

### 4. Canonical run layout now includes transcript and event history

Implemented:

- `.supercodex/runs/<run-id>/transcript.md`
- `.supercodex/runs/<run-id>/events.jsonl`

Impact:

- Canonical runs are easier to audit and reconstruct from disk alone.

### 5. Next-action packet extraction is constrained enough for real use

Implemented:

- Inline extraction ignores fenced-code noise.
- File and command extraction now prefers realistic path-like refs and command-like snippets.

Impact:

- `files_in_scope` and `tests` stay materially cleaner in generated packets.

### 6. Router and doctor drift blocking the operator path has been resolved

Implemented:

- `AGENTS.md` no longer hardcodes a stale active milestone.
- `doctor` now tolerates git head/dirty drift while the repo is idle in planning state, but still enforces git snapshot consistency when active execution or recovery state makes it relevant.

Impact:

- `pnpm cli doctor` now passes in the repo again.

### 7. A real toy-project path now exists and is regression-covered

Implemented:

- `tests/playground.test.ts`
- `playground/README.md`

Flow covered:

1. `init`
2. Replace `vault/vision.md`
3. `plan generate-roadmap`
4. `plan generate-milestone --activate --replace-queue`
5. `plan generate-slice`
6. `plan generate-tasks`
7. `plan validate`
8. `plan sync`
9. `next-action show`
10. `next-action dispatch`

Result:

- The bootstrap-from-intent path is now testable with a toy project instead of only with a pre-seeded fixture.

## Remaining Spec Gaps

### 1. Runtime routing is still mostly static

Current state:

- Runtime routing remains driven by static policy and explicit overrides.
- The system does not yet learn task-class runtime preference from observed success history.

Spec consequence:

- Section 10.4 adaptive routing remains only partially implemented.

Recommended next step:

- Persist per-task-class runtime outcome stats and feed them back into runtime selection before static fallback.

### 2. Metric coverage is still narrower than the full spec model

Current state:

- `current.json` tracks useful execution counters.
- The richer spec metrics such as babysitting minutes per slice or recovery reproducibility score are not yet emitted as derived reports.

Spec consequence:

- Section 26 is only partially satisfied.

Recommended next step:

- Add report-oriented derived metrics instead of inflating `current.json`.

## Practical Conclusion

The blockers for a serious toy-project exercise are now closed.

SUPER_CODEX can now be tested end to end against a toy project using generated roadmap, milestone, slice, and task artifacts, with deterministic state, canonical run evidence, assumption promotion, and a passing doctor baseline.
