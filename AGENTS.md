# AGENTS

SUPER_CODEX uses small router files and file-backed state. Treat [SUPER_CODEX.md](/Users/narcisbrindusescu/newme/brn/SUPER_CODEX.md) as the normative spec.

Current control points:

- Spec: [SUPER_CODEX.md](/Users/narcisbrindusescu/newme/brn/SUPER_CODEX.md)
- Vault index: [vault/index.md](/Users/narcisbrindusescu/newme/brn/vault/index.md)
- Roadmap: [vault/roadmap.md](/Users/narcisbrindusescu/newme/brn/vault/roadmap.md)
- Milestones: [vault/milestones/README.md](/Users/narcisbrindusescu/newme/brn/vault/milestones/README.md)
- Current state: [.supercodex/state/current.json](/Users/narcisbrindusescu/newme/brn/.supercodex/state/current.json)
- Questions: [vault/feedback/QUESTIONS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/QUESTIONS.md)
- Blockers: [vault/feedback/BLOCKERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/BLOCKERS.md)
- Answers: [vault/feedback/ANSWERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/ANSWERS.md)

Operating rules:

- Keep context fresh per unit; do not rely on prior chat state.
- Use local files for durable memory, escalation, and recovery.
- Treat state transitions, queueing, routing, and safety gates as deterministic-layer concerns.
- Do not duplicate the spec here; follow the referenced files.

Core role loading map:

- `conductor`: state, routing, recovery, and dispatch policy
- `interviewer`: requirement discovery and ambiguity surfacing
- `strategist`: vision, roadmap, milestone, and slice decomposition
- `mapper`: codebase maps, conventions, dependency surfaces
- `researcher`: docs, library specifics, and implementation pitfalls
- `slice-planner`: slice plan, contracts, and task boundaries
- `task-framer`: dispatch packet assembly for one unit
- `implementer`: bounded code and test changes
- `verifier`: verification ladder and evidence review
- `integrator`: convergence and contract reconciliation
- `reviewers`: architect, domain, security, performance, UX, maintainability, code quality
- `maintenance`: memory auditor, postmortem analyst, pattern extractor, skill curator, recovery agent, release/UAT packager

Project skills:

- Root skill directory: [skills/README.md](/Users/narcisbrindusescu/newme/brn/skills/README.md)
- Future layout: `skills/<name>/SKILL.md`
- Load a project skill only when the task matches its declared trigger and output contract.

Current milestone:

- Follow the active milestone recorded in [.supercodex/state/current.json](/Users/narcisbrindusescu/newme/brn/.supercodex/state/current.json) and summarized in [vault/index.md](/Users/narcisbrindusescu/newme/brn/vault/index.md).
