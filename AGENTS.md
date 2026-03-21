# Sub-Agent Router

## Overview
Sub-agents are specialized Claude Code skills invoked by the orchestrator or main agent.
Each has a focused role, scoped context, and structured output format.
Sub-agents run in **isolated context windows** via Claude Code's Agent tool.
Their tool call output does not pollute the main agent's context.

## Architecture

```
Orchestrator (loop.ts)
  │
  ├── buildAgentEnrichedPrompt()  ← Phase → Agent role mapping
  │     └── getAgentRoleForPhase()
  │
  ├── runReviewerQualityGate()    ← 6-persona code review
  │     └── buildReviewPrompt() + parseReviewOutput()
  │
  └── invokeDoctorAgent()         ← Stuck diagnosis
        └── buildAgentPrompt() + parseAgentOutput()
```

## Phase-to-Agent Mapping

| Phase | Agent | Purpose |
|---|---|---|
| DISCUSS | architect | Technical questions, gray area resolution |
| RESEARCH | researcher | Codebase scouting, library docs, pitfalls |
| PLAN_MILESTONE | architect | Slice decomposition, boundary maps |
| PLAN_SLICE | architect | Task decomposition, TDD sequences |
| EXECUTE_TASK (RED) | implementer | Write failing tests |
| EXECUTE_TASK (GREEN) | implementer | Minimum code to pass |
| EXECUTE_TASK (REFACTOR) | implementer | Clean up implementation |
| EXECUTE_TASK (VERIFY) | _(mechanical)_ | No agent — deterministic checks |
| COMPLETE_SLICE | scribe | Summary, UAT, documentation |
| COMPLETE_MILESTONE | scribe | Milestone summary, changelog |
| REASSESS | architect | Roadmap review and adjustment |
| _(on failure)_ | doctor | Error diagnosis, root cause analysis |
| _(after review)_ | reviewer | Multi-persona quality gate |
| _(post-milestone)_ | evolver | System self-improvement |

## Agent Index

### architect
**Role:** System design, interface contracts, boundary maps
**When:** PLAN_MILESTONE, PLAN_SLICE, DISCUSS (technical questions), REASSESS
**Skill:** `.superclaude/skills/architect/SKILL.md`
**Vault:** `architecture/`, `decisions/`, `contracts/`, `patterns/`
**Output:** ROADMAP.md (milestone), PLAN.md (slice), CONTEXT.md (discuss)

### implementer
**Role:** TDD code writing — the main workhorse
**When:** EXECUTE_TASK (RED, GREEN, REFACTOR sub-phases)
**Skill:** `.superclaude/skills/implementer/SKILL.md`
**Vault:** `patterns/`, `testing/`, `contracts/`
**Output:** Test files (RED), implementation files (GREEN), refactored code (REFACTOR)

### tester
**Role:** Test strategy, test writing, coverage analysis
**When:** EXECUTE_TASK (RED), VERIFY, COMPLETE_SLICE (UAT)
**Skill:** `.superclaude/skills/tester/SKILL.md`
**Vault:** `testing/`, `patterns/`
**Output:** Test files, UAT scripts, coverage analysis

### reviewer
**Role:** Code review from multiple perspectives (6 personas)
**When:** After REFACTOR/VERIFY phase, COMPLETE_SLICE
**Skill:** `.superclaude/skills/reviewer/SKILL.md`
**Vault:** `patterns/`, `architecture/`, `decisions/`, `learnings/`
**Personas:** correctness, architecture, typescript, performance, security, testability
**Output:** Issues with severity (MUST-FIX, SHOULD-FIX, CONSIDER) and suggestions

### researcher
**Role:** Codebase scouting, library docs, web research
**When:** RESEARCH phase, ad-hoc library questions
**Skill:** `.superclaude/skills/researcher/SKILL.md`
**Vault:** `architecture/`
**Output:** RESEARCH.md with don't-hand-roll, pitfalls, code locations, patterns

### doctor
**Role:** Debugging, error diagnosis, failure analysis
**When:** Unexpected test failures, static verification failures, stuck agent
**Skill:** `.superclaude/skills/doctor/SKILL.md`
**Vault:** `learnings/`, `patterns/`, `architecture/`
**Output:** Diagnosis with root cause, proposed fix, prevention recommendation

### scribe
**Role:** Documentation, summaries, changelogs, ADRs
**When:** COMPLETE_SLICE, COMPLETE_MILESTONE, after significant decisions
**Skill:** `.superclaude/skills/scribe/SKILL.md`
**Vault:** All directories (read access)
**Output:** SUMMARY.md, UAT.md, ADRs, changelog entries

### evolver
**Role:** System self-improvement — the meta-agent
**When:** Postmortem (on failure), COMPLETE_MILESTONE (periodic review)
**Skill:** `.superclaude/skills/evolver/SKILL.md`
**Vault:** All directories (read + write)
**Output:** PostmortemReport, EvolverProposal (vault doc/skill/test/verification changes)

## Review Personas

| Persona | Focus | Key Checks |
|---|---|---|
| correctness | Logic, spec compliance | Edge cases, error handling, off-by-one |
| architecture | System design fit | Patterns, abstractions, dependencies |
| typescript | Type safety, idioms | No `any`, strict mode, generics |
| performance | Scalability, efficiency | N+1 queries, re-renders, memory leaks |
| security | Safety, vulnerabilities | Injection, auth, secrets exposure |
| testability | Test quality, coverage | Behavior vs implementation, flaky risks |

Personas are budget-pressure-aware: GREEN=6, YELLOW=3, ORANGE=1, RED=0.

## Invocation Protocol

1. **Context scoping:** Orchestrator assembles context limited to the agent's vault access list. Agent-specific vault docs are loaded and deduplicated against base context.
2. **SKILL.md injection:** The agent's SKILL.md is loaded, frontmatter stripped, and injected into the prompt between the role header and task context.
3. **Scope guard:** Explicit rules at the end of the prompt (high-attention region) define what the agent IS and IS NOT responsible for.
4. **Structured output:** Agents return markdown with YAML frontmatter. The orchestrator parses frontmatter for status and agent-specific structured data.
5. **Token budget:** Each agent invocation is subject to the global context budget (80K tokens), adjusted by budget pressure multiplier (1.0/0.85/0.65/0.5).
6. **Isolation:** Each agent runs in a separate `claude -p` invocation with its own context window. Tool call output from one agent never pollutes another's context.
7. **Retry on failure:** GREEN phase retries up to 3 times before escalating to Doctor. Review issues cause rollback to GREEN for up to 2 fix attempts.
