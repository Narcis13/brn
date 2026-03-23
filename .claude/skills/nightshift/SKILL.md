---
name: nightshift
description: Start the autonomous night shift loop. Prepares clean state (archives done features, initializes from ready specs), then runs /next repeatedly until the feature is complete or blocked.
user-invocable: true
model: opus
effort: high
---

# /nightshift — Autonomous Loop

Launch the night shift — prepare a clean state, then loop `/next` until the feature is done.

**CRITICAL**: This skill is fully autonomous. Do NOT use AskUserQuestion at any point. Do NOT ask for confirmation before launching. Do NOT pause for user input. The flow is: PREPARE → LAUNCH → done. The bash loop handles everything from there via headless `claude -p` invocations. If something is wrong (no spec, blocked with no steering), report the issue and stop — don't ask what to do.

## Instructions

### Phase 1: PREPARE (ensure clean state before looping)

Read the current state and ensure we're ready to loop. Do ALL reads in parallel:

1. `.brn/state.json` (may not exist)
2. All files in `.brn/specs/` — scan for `status: ready` and `status: active` specs
3. `.brn/history/index.json` (may not exist)
4. `git status` and `git log --oneline -5`

Then evaluate and act based on what you find:

#### Case A: No `state.json` exists (fresh start)
1. Find a spec in `.brn/specs/` with `status: ready`
2. If no spec found: report "No spec found. Drop a spec in `.brn/specs/` with `status: ready` and run `/nightshift`." and **stop**.
3. Read the spec thoroughly
4. Extract acceptance criteria from the spec's requirements and user stories
5. Create the feature branch: `git checkout -b feat/<feature-name>`
6. Write `.brn/state.json`:
   ```json
   {
     "feature": "<feature-name>",
     "spec": "<spec-filename>",
     "branch": "feat/<feature-name>",
     "status": "planning",
     "acceptance_criteria": [{"id": "AC1", "text": "...", "met": false}, ...],
     "run_count": 0,
     "current_focus": null,
     "last_run": null,
     "retry_count": 0,
     "blocked": false
   }
   ```
7. Update the spec's frontmatter: set `status: active`
8. Create `.brn/steering.md` with empty `## Active` and `## Acknowledged` sections
9. Create `.brn/history/index.json` as empty array `[]`
10. Create `.brn/history/runs/` directory
11. Commit: `git add .brn/ && git commit -m "feat: initialize BRN for <feature>"`
12. Proceed to Phase 2

#### Case B: `state.json` exists with `status: "done"` (previous feature completed)
1. Archive the completed feature:
   - Create `.brn/archive/<feature-name>/` directory
   - Move `.brn/history/runs/` → `.brn/archive/<feature-name>/history/`
   - Move `.brn/history/index.json` → `.brn/archive/<feature-name>/index.json`
   - Copy `.brn/state.json` → `.brn/archive/<feature-name>/state.json`
   - Copy `.brn/steering.md` → `.brn/archive/<feature-name>/steering.md`
   - Update the completed spec's frontmatter: set `status: done`
2. **Keep the vault** — it persists across all features (compounding knowledge)
3. Reset for new feature:
   - Delete `.brn/state.json`
   - Create fresh `.brn/history/runs/` directory
   - Create fresh `.brn/history/index.json` as empty array `[]`
   - Clear `.brn/steering.md` to empty `## Active` / `## Acknowledged` sections
4. Find a spec in `.brn/specs/` with `status: ready`
   - If no spec found: report "Previous feature archived. No new spec found. Drop a spec in `.brn/specs/` with `status: ready`." and **stop**.
5. Initialize the new feature (same as Case A steps 3–11)
6. Commit: `git add .brn/ && git commit -m "feat: archive <old-feature>, initialize <new-feature>"`
7. Proceed to Phase 2

#### Case C: `state.json` exists with `status: "blocked"`
1. Check `.brn/steering.md` for new directives under `## Active` that might unblock
2. If found: clear `blocked` to `false`, remove `blocked_reason`, proceed to Phase 2
3. If not found: report the block reason and **stop**. Suggest adding steering directives.

#### Case D: `state.json` exists with an active status (in-progress feature)
1. Feature is already active — no preparation needed
2. Proceed directly to Phase 2

### Phase 2: LAUNCH LOOP

After Phase 1 completes with a clean active state:

1. Check that `.brn/nightshift.sh` exists. If not, create it:

```bash
#!/bin/bash
# BRN Night Shift — autonomous coding loop

FEATURE=$(jq -r '.feature' .brn/state.json)
LOGFILE=".brn/nightshift.log"
START_TIME=$(date +%s)

echo "=== BRN NIGHT SHIFT ===" | tee -a "$LOGFILE"
echo "Feature: $FEATURE" | tee -a "$LOGFILE"
echo "Started: $(date)" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

MAX_RUNS=200
run=0

while [ $run -lt $MAX_RUNS ]; do
  run=$((run + 1))
  RUN_START=$(date +%s)
  echo "[$(date '+%H:%M:%S')] ━━━ Run $run starting ━━━" | tee -a "$LOGFILE"

  claude -p \
    --model opus \
    --effort high \
    --dangerously-skip-permissions \
    --max-turns 100 \
    "/next" 2>&1 | tee -a "$LOGFILE"

  RUN_END=$(date +%s)
  RUN_DURATION=$((RUN_END - RUN_START))

  status=$(jq -r '.status' .brn/state.json 2>/dev/null)
  blocked=$(jq -r '.blocked' .brn/state.json 2>/dev/null)
  ac_progress=$(jq '[.acceptance_criteria[] | select(.met == true)] | length' .brn/state.json 2>/dev/null)
  ac_total=$(jq '.acceptance_criteria | length' .brn/state.json 2>/dev/null)
  run_count=$(jq -r '.run_count' .brn/state.json 2>/dev/null)
  vault_count=$(find .brn/vault -name '*.md' 2>/dev/null | wc -l | tr -d ' ')

  echo "[$(date '+%H:%M:%S')] Run $run finished in ${RUN_DURATION}s | AC: $ac_progress/$ac_total | Vault: $vault_count entries | Status: $status" | tee -a "$LOGFILE"

  if [ "$status" = "done" ]; then
    TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
    echo "" | tee -a "$LOGFILE"
    echo "[$(date '+%H:%M:%S')] ✓ FEATURE COMPLETE in $run runs (${TOTAL_DURATION}s total)" | tee -a "$LOGFILE"
    osascript -e 'display notification "Night shift complete! Feature done." with title "BRN"' 2>/dev/null
    break
  fi

  if [ "$blocked" = "true" ]; then
    reason=$(jq -r '.blocked_reason' .brn/state.json 2>/dev/null)
    echo "" | tee -a "$LOGFILE"
    echo "[$(date '+%H:%M:%S')] ✗ BLOCKED: $reason" | tee -a "$LOGFILE"
    echo "Add steering directives to .brn/steering.md to unblock." | tee -a "$LOGFILE"
    osascript -e 'display notification "Night shift blocked. Check steering." with title "BRN"' 2>/dev/null
    sleep 300
    # Re-check after sleep (maybe user added steering)
    continue
  fi

  echo "" | tee -a "$LOGFILE"
  sleep 10
done

if [ $run -ge $MAX_RUNS ]; then
  echo "[$(date '+%H:%M:%S')] Max runs reached ($MAX_RUNS). Stopping." | tee -a "$LOGFILE"
  osascript -e 'display notification "Night shift hit max runs limit." with title "BRN"' 2>/dev/null
fi

TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
echo "" | tee -a "$LOGFILE"
echo "=== NIGHT SHIFT ENDED ===" | tee -a "$LOGFILE"
echo "Total runs: $run" | tee -a "$LOGFILE"
echo "Total time: ${TOTAL_DURATION}s" | tee -a "$LOGFILE"
echo "Final status: $(jq -r '.status' .brn/state.json)" | tee -a "$LOGFILE"
echo "Vault entries: $(find .brn/vault -name '*.md' 2>/dev/null | wc -l | tr -d ' ')" | tee -a "$LOGFILE"
```

2. Make it executable: `chmod +x .brn/nightshift.sh`

3. Clear the nightshift log: truncate `.brn/nightshift.log` to start fresh for this session.

4. Show a brief status line:
```
Night shift launching.
  Feature: <feature-name>
  Branch: feat/<feature-name>
  Acceptance criteria: <N> items
  Monitor: tail -f .brn/nightshift.log
  Steer: edit .brn/steering.md
  Stop: kill the process (Ctrl+C or kill <PID>)
```

5. **Immediately launch** the loop via Bash with `run_in_background: true`:
```bash
cd <project_root> && .brn/nightshift.sh
```
Do NOT ask the user for confirmation. Do NOT use AskUserQuestion. The whole point of `/nightshift` is autonomous execution — observe, orient, decide, act, repeat until done or blocked. Just launch it.
