---
name: nightshift
description: Start the autonomous night shift loop. Runs /next repeatedly until the feature is complete or blocked.
user-invocable: true
model: sonnet
effort: medium
---

# /nightshift — Autonomous Loop

Launch the night shift — a background loop that runs `/next` until the feature is done.

## Instructions

1. Read `.brn/state.json` to confirm there's an active feature
2. If no active feature, report error and suggest running `/next` first

3. Check that `.brn/nightshift.sh` exists. If not, create it:

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

4. Make it executable: `chmod +x .brn/nightshift.sh`

5. Show the user:
```
Night shift ready.

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

6. Ask if they want to launch it now. If yes, run it via Bash with `run_in_background: true`.
