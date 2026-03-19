# SUPER_CLAUDE Project

## Runtime
- **Always use Bun** — not Node.js, npm, or npx
- `bun run`, `bun test`, `bun build`, `bunx`
- Bun auto-loads `.env` — no dotenv needed

## Architecture
This project implements the SUPER_CLAUDE self-evolving AI coding system.
- **Deterministic layer**: `.superclaude/orchestrator/` — Bun/TypeScript scripts handling state, git, context, verification
- **LLM layer**: Claude via Claude Code — judgment, code writing, test design, review
- Machine state is JSON on disk (`.superclaude/state/state.json`), prompt-injected content stays markdown
- The vault (`.superclaude/vault/`) is the system's long-term memory

## Coding Standards
- TypeScript strict mode — no `any` types
- All orchestrator code uses explicit types from `orchestrator/types.ts`
- Prefer `Bun.file()` over `node:fs`
- Use `Bun.$` for shell commands instead of child_process
- Frontmatter in markdown files uses YAML between `---` fences

## Testing
- `bun test` for all tests
- Test files co-located: `foo.test.ts` next to `foo.ts`
- TDD enforced: one-shot IMPLEMENT (tests + code + refactor) → VERIFY

## Key Paths
- `SUPER_CLAUDE.md` — Full system spec
- `AGENTS.md` — Sub-agent router/index
- `.superclaude/orchestrator/` — Deterministic brain
- `.superclaude/state/state.json` — Current state machine position
- `.superclaude/vault/` — Living knowledge base
- `.superclaude/skills/` — SKILL.md files for sub-agents

## Git Convention
- Branch per milestone: `superc/M001`
- Commits: `feat(S01/T01): [implement] description`
- Squash merge to main on milestone completion
