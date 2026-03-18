# Sub-Agent Router

## Overview
Sub-agents are specialized Claude Code skills invoked by the orchestrator or main agent.
Each has a focused role, scoped context, and structured output format.

## Agent Index

### architect
**Role:** System design, interface contracts, boundary maps
**When:** PLAN_MILESTONE, PLAN_SLICE, DISCUSS (technical questions)
**Skill:** `.superclaude/skills/architect/SKILL.md`
**Vault:** `architecture/`, `decisions/`, `contracts/`, `patterns/`

### implementer
**Role:** TDD code writing — the main workhorse
**When:** EXECUTE_TASK (RED, GREEN, REFACTOR sub-phases)
**Skill:** `.superclaude/skills/implementer/SKILL.md`
**Vault:** `patterns/`, `testing/`, `contracts/`

### tester
**Role:** Test strategy, test writing, coverage analysis
**When:** EXECUTE_TASK (RED), VERIFY, COMPLETE_SLICE (UAT)
**Skill:** `.superclaude/skills/tester/SKILL.md`
**Vault:** `testing/`, `patterns/`

### reviewer
**Role:** Code review from multiple perspectives (6 personas)
**When:** After REFACTOR, COMPLETE_SLICE
**Skill:** `.superclaude/skills/reviewer/SKILL.md`
**Vault:** `patterns/`, `architecture/`, `decisions/`, `learnings/`
**Personas:** correctness, architecture, typescript, performance, security, testability

### researcher
**Role:** Codebase scouting, library docs, web research
**When:** RESEARCH phase, ad-hoc library questions
**Skill:** `.superclaude/skills/researcher/SKILL.md`
**Vault:** `architecture/`

### doctor
**Role:** Debugging, error diagnosis, failure analysis
**When:** Unexpected test failures, static verification failures, stuck agent
**Skill:** `.superclaude/skills/doctor/SKILL.md`
**Vault:** `learnings/`, `patterns/`, `architecture/`

### scribe
**Role:** Documentation, summaries, changelogs, ADRs
**When:** COMPLETE_SLICE, COMPLETE_MILESTONE, after decisions
**Skill:** `.superclaude/skills/scribe/SKILL.md`
**Vault:** All directories (read access)

### evolver
**Role:** System self-improvement — the meta-agent
**When:** Postmortem, COMPLETE_MILESTONE (periodic review)
**Skill:** `.superclaude/skills/evolver/SKILL.md`
**Vault:** All directories (read + write)

## Invocation Protocol
1. Orchestrator assembles context scoped to the agent's vault access
2. Explicit scope guard: what the agent IS and IS NOT responsible for
3. Agent returns structured markdown with YAML frontmatter
4. Token budget enforced per agent invocation
