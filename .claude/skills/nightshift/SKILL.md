---
name: nightshift
description: Start the autonomous night shift loop. Prepares clean state (archives done features, initializes from ready specs), then runs /next repeatedly until the feature is complete or blocked.
user-invocable: true
model: opus
effort: high
---

# /nightshift — Autonomous Loop

Launch the night shift — prepare a clean state, then loop `/next` until the feature is done.

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

echo "=== BRN NIGHT SHIFT ==="
echo "Feature: $(jq -r '.feature' .brn/state.json)"
echo "Started: $(date)"
echo ""

MAX_RUNS=50
run=0

while [ $run -lt $MAX_RUNS ]; do
  run=$((run + 1))
  echo "[$(date '+%H:%M:%S')] Run $run starting..."

  claude -p \
    --model opus \
    --effort high \
    --dangerously-skip-permissions \
    --max-turns 100 \
    "/next" 2>&1 | tee -a .brn/nightshift.log

  status=$(jq -r '.status' .brn/state.json 2>/dev/null)
  blocked=$(jq -r '.blocked' .brn/state.json 2>/dev/null)

  if [ "$status" = "done" ]; then
    echo ""
    echo "[$(date '+%H:%M:%S')] FEATURE COMPLETE!"
    osascript -e 'display notification "Night shift complete! Feature done." with title "BRN"' 2>/dev/null
    break
  fi

  if [ "$blocked" = "true" ]; then
    reason=$(jq -r '.blocked_reason' .brn/state.json 2>/dev/null)
    echo ""
    echo "[$(date '+%H:%M:%S')] BLOCKED: $reason"
    echo "Add steering directives to .brn/steering.md to unblock."
    osascript -e 'display notification "Night shift blocked. Check steering." with title "BRN"' 2>/dev/null
    sleep 300
    # Re-check after sleep (maybe user added steering)
    continue
  fi

  echo "[$(date '+%H:%M:%S')] Run $run complete."
  sleep 10
done

if [ $run -ge $MAX_RUNS ]; then
  echo "[$(date '+%H:%M:%S')] Max runs reached ($MAX_RUNS). Stopping."
  osascript -e 'display notification "Night shift hit max runs limit." with title "BRN"' 2>/dev/null
fi

echo ""
echo "=== NIGHT SHIFT ENDED ==="
echo "Total runs: $run"
echo "Final status: $(jq -r '.status' .brn/state.json)"
```

2. Make it executable: `chmod +x .brn/nightshift.sh`

3. Show the user:
```
Night shift ready.

Preparation complete:
  - Archived: <old-feature> (if applicable)
  - Initialized: <new-feature>
  - Branch: feat/<feature-name>
  - Acceptance criteria: <N> items

To start:
  cd <project_root> && .brn/nightshift.sh

To run in background:
  nohup .brn/nightshift.sh &

To monitor:
  tail -f .brn/nightshift.log

To steer mid-run:
  Edit .brn/steering.md (the next /next will pick it up)

To stop:
  Kill the process (Ctrl+C or kill <PID>)
```

4. Ask if they want to launch it now. If yes, run it via Bash with `run_in_background: true`.
