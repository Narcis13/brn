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
