# SUPER_CLAUDE Project

## Runtime
- **Always use Bun** — not Node.js, npm, or npx
- `bun run`, `bun test`, `bun build`, `bunx`
- Bun auto-loads `.env` — no dotenv needed

## Hard Rules
These apply in every phase, every agent role, no exceptions.
- **NEVER** expand scope beyond what the current prompt asks for
- **NEVER** modify files outside the task's artifact list during EXECUTE_TASK
- **NEVER** use `any` types, `as any` casts, `@ts-ignore`, or `@ts-expect-error`
- **NEVER** add features, helpers, or abstractions not explicitly requested
- **NEVER** skip writing tests — TDD is mechanically enforced
- **NEVER** leave TODO/FIXME/stub in implementation files
- **ALWAYS** write output files at the EXACT paths specified in the prompt
- **ALWAYS** use the Write tool for output files — do not just print content
- **ALWAYS** run `bun test` before finishing any implementation work
- **ALWAYS** preserve existing file structure — don't reorganize what you weren't asked to touch

## Coding Conventions
- TypeScript strict mode everywhere — `tsconfig.json` has `"strict": true`
- Explicit return types on all exported functions
- Use `import type` for type-only imports
- Use `unknown` with type guards instead of `any`
- Prefer `Bun.file()` over `node:fs` for file operations
- Use `Bun.$` for shell commands instead of `child_process`
- Frontmatter in markdown files uses YAML between `---` fences
- All orchestrator types come from `orchestrator/types.ts` — don't redeclare them

## Testing Conventions
- Test files co-located: `foo.test.ts` next to `foo.ts`
- TDD one-shot: write failing tests → implement minimum code → refactor → verify
- Every test covers: happy path, edge cases, error cases, integration points
- Use temp directories (`/tmp/superclaude-test-*`) for I/O tests with beforeEach/afterEach cleanup
- Test behavior explicitly — no snapshot tests for behavior
- Only mock external boundaries — never mock internal modules
- Tests must be independent — no execution order dependencies

## File & Naming Conventions
- IDs are uppercase with zero-padded numbers: `M001`, `S01`, `T01`
- Milestones live at: `.superclaude/state/milestones/M001/`
- Slices live at: `.superclaude/state/milestones/M001/slices/S01/`
- Tasks live at: `.superclaude/state/milestones/M001/slices/S01/tasks/T01/`
- Each level produces standard files: `PLAN.md`, `SUMMARY.md`, `ROADMAP.md`
- Specs (human-written requirements) live at: `.superclaude/specs/`
- Vault (long-term knowledge) lives at: `.superclaude/vault/`
- Reference vault docs in task plans with `[[path/name]]` syntax (e.g. `[[patterns/typescript]]`)

## Output Contracts
The orchestrator parses your output. Follow these formats exactly:
- **Slice IDs** in ROADMAP.md: `### S01:`, `### S02:` — the regex depends on this
- **Task IDs** in PLAN.md: `### T01:`, `### T02:` — same
- **Review issues**: `**MUST-FIX** | file:line | description` (also SHOULD-FIX, CONSIDER)
- **Frontmatter**: always include `status:` field — the orchestrator checks it
- **File writes**: use the Write tool to create output files — the orchestrator verifies file existence, not stdout content

## Error Recovery
When running headless, you can't ask for help. Follow these rules:
- **`bun test` fails**: read the error, fix the code, run again — do not skip or comment out tests
- **File doesn't exist**: if it's an input file, work without it — if it's an output file, create its parent directories first
- **Type error**: fix the type — don't cast to `any` or suppress
- **Import not found**: check the exact path — files use `.ts` extensions in imports
- **Scope unclear**: implement the minimum interpretation — don't guess at expanded scope
- **Tests pass but something feels off**: if tests pass and must-haves are met, you're done — don't gold-plate

## Architecture (Reference Only)
- **Deterministic layer**: `.superclaude/orchestrator/` — state, git, context, TDD enforcement
- **LLM layer**: Claude via Claude Code — judgment, code, design, review
- State is JSON/markdown on disk — human-inspectable, git-trackable
- Hierarchy: Milestone → Slice → Task (each with its own plan, execution, summary)
- The vault at `.superclaude/vault/` is long-term memory — patterns, decisions, learnings

## Git Convention
- Branch per milestone: `superc/M001`
- Commits: `feat(S01/T01): [implement] description`
- Squash merge to main on milestone completion
