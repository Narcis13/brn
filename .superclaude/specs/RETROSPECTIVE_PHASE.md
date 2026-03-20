---
title: RETROSPECTIVE Phase — Knowledge Extraction After Slice Completion
type: enhancement
status: ready
priority: high
milestone: TBD
created: 2026-03-20
---

# RETROSPECTIVE Phase

## Problem

The system has no learning loop. Each `claude -p` invocation gets the same static CLAUDE.md + near-empty vault + task-specific context. Three vault directories designed for accumulated knowledge are permanently empty:

```
vault/decisions/    → _No ADRs yet_
vault/learnings/    → _No learnings yet_
vault/playbooks/    → _No playbooks yet_
```

The Evolver agent is only wired to postmortem analysis on **failures** (loop.ts:949). Successes — which carry just as much signal — are ignored. Execution artifacts (debug logs, doctor diagnoses, session reports) are written to disk but never analyzed or compounded.

Real cost example from S03: the mock.module pollution saga required 3 TDD retries + doctor diagnosis + manual fix (~$2-3 in API calls). A single 5-line vault learning prevents that forever.

## Proposal

Split the current REASSESS phase into two sub-phases:

### Phase A: RETROSPECTIVE (new)

The Evolver agent reads the slice's execution history and extracts knowledge into the vault.

| Source | Signal | Vault Target |
|---|---|---|
| Debug outputs (doctor diagnoses) | Root causes, what broke and why | `learnings/` |
| Session reports (issues, timing) | Recurring friction, slow steps | `learnings/` |
| Postmortems | Failure patterns, prevention rules | `learnings/` |
| Task summaries + code diff | Patterns that emerged, architectural choices | `decisions/`, `patterns/` updates |
| Manual interventions (CONTINUE.md, stuck loops) | Operational runbooks | `playbooks/` |

### Phase B: ROADMAP_REVIEW (existing REASSESS logic)

Stays as-is — "should we reorder/add/remove slices?" But now enriched because the vault was just updated with learnings that might inform the roadmap decision.

## How This Compounds Into Better `claude -p` Calls

Current flow (no learning):
```
S01 → Claude learns by trial and error
S02 → Claude learns by trial and error (same mistakes possible)
S03 → Claude learns by trial and error (same mistakes possible)
```

Proposed flow (compounding):
```
S01 → Claude learns by trial and error
S01 RETROSPECTIVE → extracts 2-3 learnings into vault
S02 → Claude sees S01's learnings → avoids same mistakes → fewer tool calls
S02 RETROSPECTIVE → extracts more learnings → vault grows
S03 → Claude has S01+S02 learnings → even better execution
```

Each slice trains the next one. This is what makes the system self-evolving.

## Context Assembly Changes

Currently `context.ts` loads vault docs only via `[[reference]]` syntax in task plans. Learnings only reach the implementer if someone manually adds `[[learnings/bun-mock-module-pollution]]` to a task plan. That won't happen.

Instead, auto-load learnings during EXECUTE_TASK:

```typescript
// In assembleContext, during EXECUTE_TASK:
case "EXECUTE_TASK":
  // ... existing code ...

  // Auto-load ALL learnings (they're short, high-value)
  payload.vaultDocs.push(...await loadAllVaultByType(projectRoot, "learnings"));

  // Auto-load playbooks tagged with current technologies
  payload.vaultDocs.push(...await loadRelevantPlaybooks(projectRoot, payload.taskPlan));
  break;
```

This ensures every implementer sees accumulated learnings without manual wiring.

## Retrospective Context Assembly

The RETROSPECTIVE phase needs execution artifacts as input:

```typescript
async function assembleRetrospectiveContext(
  projectRoot: string,
  milestoneId: string,
  sliceId: string,
): Promise<ContextPayload> {
  // 1. All task summaries for this slice (what was built)
  // 2. Debug folder: doctor diagnoses (output-*.md from this slice's timeframe)
  // 3. Session reports from this slice's execution
  // 4. Postmortems (if any were generated)
  // 5. Git diff for the entire slice (what actually changed vs what was planned)
  // 6. Current vault INDEX.md (to avoid duplicates)
  // 7. Current vault learnings (to check for existing coverage)
}
```

Key: filter debug outputs by timestamp range matching the slice's execution window. Don't load all history — just what happened during this slice.

## Retrospective Prompt

```markdown
# RETROSPECTIVE PHASE

You are the Evolver sub-agent. Analyze the completed slice's execution
history and extract knowledge for the vault.

## Completed Slice Summary
[task summaries, what was built]

## Execution History
[debug outputs — especially doctor diagnoses]
[session report — issues encountered, timing]
[postmortems — if any]

## Git Delta
[git diff summary for the slice]

## Current Vault
[INDEX.md + existing learnings/decisions/playbooks]

## Instructions

### 1. Extract LEARNINGS (vault/learnings/)
What went wrong, what was surprising, what should future agents avoid?
- Must be **actionable** — not "tests are important" but "Bun mock.module
  is global, use in-memory DBs instead"
- Must be **generalizable** to future slices, not one-off fixes
- Include the root cause, not just the symptom
- Max 5 learnings per slice — prioritize by impact

### 2. Extract DECISIONS (vault/decisions/)
What architectural choices emerged during implementation?
- Only non-obvious decisions that a future architect needs to know
- Include the alternatives that were considered and why they were rejected
- Format as lightweight ADRs

### 3. Extract PLAYBOOKS (vault/playbooks/)
Did any manual intervention happen that could be a documented procedure?
- Recovery steps, debugging workflows, operational runbooks
- Must be repeatable — not ad-hoc one-time fixes

### 4. Update PATTERNS (vault/patterns/)
Should any existing vault docs be updated with new findings?
- New anti-patterns discovered
- Refinements to existing conventions

### 5. Update INDEX (vault/INDEX.md)
Add entries for all new vault documents.

## Quality Rules
- Each document must have proper frontmatter (title, type, source, tags)
- Each learning must be under 15 lines
- Deduplicate — if a learning already exists in the vault, skip or merge
- Source reference required — which slice/task/error it came from
- Tags required — for relevance matching during context assembly

## Scope Guard
- DO NOT modify any code
- DO NOT modify the roadmap (that's the next phase)
- ONLY write vault documents and update INDEX.md
```

## Example Vault Outputs

### Learning (from S03 mock pollution)

```markdown
# .superclaude/vault/learnings/bun-mock-module-pollution.md
---
title: Bun mock.module() is process-global
type: learning
source: S03/T02 doctor diagnosis
tags: [testing, bun, mocking]
related: [[testing/strategy]]
---

Bun's `mock.module()` replaces modules globally for the entire test process.
`mock.restore()` in beforeEach resets call counts but does NOT un-register
the module replacement. Using it on internal modules (repos, services)
pollutes other test files when running the full suite.

**Fix:** Use real in-memory SQLite databases for service/repo tests.
Only mock at true external boundaries (HTTP, third-party APIs).

**Detection:** Tests pass in isolation but fail in full suite with
unexpected mock values leaking across files.
```

### Playbook (from S03 stuck loop)

```markdown
# .superclaude/vault/playbooks/unstick-completed-task.md
---
title: How to unstick a task that completed but wasn't committed
type: playbook
source: S03/T01 stuck loop
tags: [orchestrator, recovery, state]
---

## Symptoms
- State shows EXECUTE_TASK/IMPLEMENT for a task
- Code exists and tests pass
- Loop re-dispatches same task repeatedly
- Debug output shows agent saying "already complete"

## Root Cause
Task completion depends on SUMMARY.md existence (milestone-manager.ts:231).
If commit or summary write fails silently, `listTasks` sees the task as
"pending" forever.

## Fix
1. Verify tests pass: `bun test <task-test-file>`
2. Write SUMMARY.md in the task directory
3. Update PLAN.md frontmatter: `status: complete`
4. Commit the implementation files
5. Advance state.json to the next task
```

### Decision (from S03 architecture)

```markdown
# .superclaude/vault/decisions/ADR-001-card-columns-as-strings.md
---
title: "ADR-001: Card columns as fixed strings, not entities"
type: decision
source: S03/T01 planning
tags: [architecture, data-model, cards]
---

## Context
Cards need to belong to columns (todo/doing/done) on a board.

## Decision
Columns are a `CardColumn` union type (`"todo" | "doing" | "done"`),
stored as a string field on the Card entity. No separate Column table.

## Alternatives Considered
- Separate Column entity with its own table — rejected because MVP has
  fixed columns, and a separate entity adds migration complexity
  for no current benefit

## Consequences
- Adding custom columns later requires a migration + new entity
- Position tracking is per-column (column_name + position fields)
```

## State Machine Changes

Current:
```
EXECUTE_TASK → COMPLETE_SLICE → REASSESS → next slice
```

Proposed:
```
EXECUTE_TASK → COMPLETE_SLICE → RETROSPECTIVE → REASSESS → next slice
```

Add `"RETROSPECTIVE"` to the Phase type in types.ts. State transitions:
- COMPLETE_SLICE completion → advance to RETROSPECTIVE
- RETROSPECTIVE completion → advance to REASSESS
- REASSESS completion → advance to next slice (unchanged)

## Implementation Files

| File | Change |
|---|---|
| `types.ts` | Add `"RETROSPECTIVE"` to Phase type |
| `prompt-builder.ts` | New `buildRetrospectivePrompt()` |
| `context.ts` | New `assembleRetrospectiveContext()` gathering debug/session/postmortem artifacts |
| `context.ts` | Update EXECUTE_TASK context to auto-load vault learnings |
| `state.ts` | Wire RETROSPECTIVE into transitions: COMPLETE_SLICE → RETROSPECTIVE → REASSESS |
| `state.ts` | `determineNextActionEnhanced`: handle RETROSPECTIVE phase |
| `loop.ts` | Handle RETROSPECTIVE output — verify vault docs written, update INDEX.md |
| `agents.ts` | Add evolver agent vault doc mapping for RETROSPECTIVE |
| `loop.ts` | RETROSPECTIVE output processing (validate vault writes) |

## Token Budget Considerations

- Learnings should be short (under 15 lines each) — loading all of them is cheap
- Debug outputs can be large — filter to doctor diagnoses and error outputs only, skip full prompts
- Set a vault docs budget increase: current 10,000 tokens may need 15,000 to fit learnings + referenced docs
- Recency bias: if vault grows large, prioritize recent learnings (last 2-3 slices)

## Quality Control

Biggest risk is vault pollution — the Evolver writing obvious or noisy learnings. The prompt enforces:

- Each learning must be **actionable** — concrete, not platitudes
- **Max 5 learnings per slice** — forces prioritization
- Each must be **under 15 lines** — concise, not essays
- Must include **source reference** — traceability
- Must include **tags** — for relevance matching
- Must **deduplicate** — check existing vault before writing

## Verification

After RETROSPECTIVE completes, the orchestrator should verify:
- At least 1 vault document was written (unless the slice was truly uneventful)
- INDEX.md was updated
- All new documents have valid frontmatter
- No documents exceed 15 lines of content
- No duplicate titles in the vault

## Risk Assessment

- **Low risk**: Additive change — existing REASSESS logic stays, RETROSPECTIVE is inserted before it
- **Medium effort**: New prompt, context loader, phase wiring, vault write handling
- **High value**: Each slice execution gets better context, fewer mistakes, faster convergence
- **Compounds over time**: The ROI grows with every milestone
