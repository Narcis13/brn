# CLAUDE

Treat [SUPER_CODEX.md](/Users/narcisbrindusescu/newme/brn/SUPER_CODEX.md) as the normative operating contract. This file is a small router, not a duplicate manual.

Primary references:

- Spec: [SUPER_CODEX.md](/Users/narcisbrindusescu/newme/brn/SUPER_CODEX.md)
- Vault index: [vault/index.md](/Users/narcisbrindusescu/newme/brn/vault/index.md)
- Roadmap: [vault/roadmap.md](/Users/narcisbrindusescu/newme/brn/vault/roadmap.md)
- Milestones: [vault/milestones/README.md](/Users/narcisbrindusescu/newme/brn/vault/milestones/README.md)
- Current state: [.supercodex/state/current.json](/Users/narcisbrindusescu/newme/brn/.supercodex/state/current.json)
- Questions: [vault/feedback/QUESTIONS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/QUESTIONS.md)
- Blockers: [vault/feedback/BLOCKERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/BLOCKERS.md)
- Answers: [vault/feedback/ANSWERS.md](/Users/narcisbrindusescu/newme/brn/vault/feedback/ANSWERS.md)
- Skills: [skills/README.md](/Users/narcisbrindusescu/newme/brn/skills/README.md)

Default posture:

- Headless-first execution until a hard blocker, contradiction with high blast radius, or irreversible action boundary appears.
- Use local-file communication for questions, blockers, answers, assumptions, and recovery.
- Keep router files small and reference-first.
- Put runtime-specific details in referenced docs and machine state, not in this router body.

Execution expectations:

- Read the current unit and acceptance criteria from file-backed state.
- Prefer deterministic policies for routing, queueing, safety, git, and recovery.
- Log assumptions when ambiguity is decidable and escalate through feedback files when it is not.
- Preserve evidence and continuation guidance in `.supercodex/` artifacts rather than relying on chat history.

Active milestone:

- `M001` / Vault and State Engine. Use [vault/milestones/M001/milestone.md](/Users/narcisbrindusescu/newme/brn/vault/milestones/M001/milestone.md) as the current milestone anchor.
