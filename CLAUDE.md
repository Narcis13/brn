# BRN — Autonomous Coding Agent

## Runtime
- **Always use Bun** — not Node.js, npm, or npx
- `bun run`, `bun test`, `bun build`, `bunx`
- Bun auto-loads `.env` — no dotenv needed

## Philosophy
No deterministic orchestrator. No framework code. Claude IS the orchestrator.
- The `/next` skill is the core loop — it reads state, thinks, executes, verifies, learns, commits
- AI crafts prompts for AI — the Thinker (Opus) builds context for the Builder (`claude -p`)
- Knowledge compounds in the vault — every run can make the next one better
- State lives on disk as JSON/markdown — human-inspectable, git-trackable

## Hard Rules
- **NEVER** expand scope beyond what the current step requires
- **NEVER** use `any` types, `as any` casts, `@ts-ignore`, or `@ts-expect-error`
- **NEVER** skip writing tests
- **NEVER** leave TODO/FIXME/stub in implementation files
- **NEVER** ship UI without proper styling — unstyled HTML is not "done"
- **ALWAYS** run `bun test` before committing any implementation work
- **ALWAYS** verify types with `tsc --noEmit` when TypeScript is used
- **ALWAYS** create parent directories before writing files to nested paths
- **ALWAYS** preserve existing file structure — don't reorganize what you weren't asked to touch

## Coding Conventions
- TypeScript strict mode — `tsconfig.json` has `"strict": true`
- Explicit return types on all exported functions
- Use `import type` for type-only imports
- Use `unknown` with type guards instead of `any`
- Prefer `Bun.file()` over `node:fs` for file operations
- Use `Bun.$` for shell commands instead of `child_process`
- CSS in a separate file, not inline styles — link from HTML

## Testing Conventions
- Test files co-located: `foo.test.ts` next to `foo.ts`
- Write tests first, then implement — TDD
- Cover: happy path, edge cases, error cases
- Use temp directories (`/tmp/brn-test-*`) for I/O tests with cleanup
- Only mock external boundaries — never mock internal modules
- Tests must be independent — no execution order dependencies

## BRN Directory Structure
```
.brn/
  state.json              # Current feature state (created by /next)
  steering.md             # Human directives for the agent
  specs/                  # Feature specifications (human-written, status: ready|active|done)
  vault/                  # Compounding knowledge base (persists across ALL features)
    patterns/             # What works
    anti-patterns/        # What to avoid
    decisions/            # Key choices and why
    codebase/             # Insights about this codebase
  history/                # Run history (reset per feature)
    runs/                 # One folder per /next run
    index.json            # Quick-scan summary
  archive/                # Completed features (auto-created by /next)
    <feature-name>/       # Each completed feature gets archived here
      state.json          # Final state snapshot
      steering.md         # Steering history
      history/            # All run records
```

## Feature Lifecycle
1. Drop a spec in `.brn/specs/` with `status: ready` in frontmatter
2. Run `/next` — it initializes state, creates branch, sets spec to `status: active`
3. Keep running `/next` (or `/nightshift`) until all acceptance criteria pass
4. `/next` creates a PR, sets spec to `status: done`, sets state to `done`
5. Next `/next` call: archives completed feature, picks up next `ready` spec
6. **Vault persists forever** — knowledge compounds across all features

## Skills
| Command | Purpose |
|---------|---------|
| `/next` | Advance the feature by one step (the core loop) |
| `/status` | Show progress dashboard |
| `/steer <directive>` | Add a steering directive |
| `/nightshift` | Start the autonomous loop |

## Git Convention
- Branch per feature: `feat/<feature-name>`
- Commits: `feat(<feature>): <what this step did>`
- PR when all acceptance criteria are met

## Error Recovery (Headless)
When running via `claude -p`, you can't ask for help:
- **`bun test` fails**: read the error, fix the code, run again — never skip or comment out tests
- **File doesn't exist**: create parent directories first, then write
- **Type error**: fix the type — don't cast to `any` or suppress
- **Import not found**: check the exact path — use `.ts` extensions
- **Scope unclear**: implement the minimum interpretation — don't guess at expanded scope
- **Tests pass but something feels off**: if tests pass and acceptance criteria are met, you're done — don't gold-plate
- **Retry limit**: max 1 retry per step. Extract learnings, push to vault, move on

## Vault Rules
- Max 30 entries — merge duplicates, prune low-confidence entries
- Only store knowledge NOT obvious from reading the code
- Include Problem/Solution/Context for anti-patterns
- Include Approach/Example/When-to-use for patterns
- Mark confidence: `speculative` → `verified`
