#!/bin/bash
# BRN Night Shift — autonomous coding loop with protocol enforcement

FEATURE=$(jq -r '.feature' .brn/state.json)
LOGFILE=".brn/nightshift.log"
START_TIME=$(date +%s)

echo "=== BRN NIGHT SHIFT ===" | tee -a "$LOGFILE"
echo "Feature: $FEATURE" | tee -a "$LOGFILE"
echo "Started: $(date)" | tee -a "$LOGFILE"
echo "" | tee -a "$LOGFILE"

MAX_RUNS=200
run=0
violations=0

while [ $run -lt $MAX_RUNS ]; do
  run=$((run + 1))
  RUN_START=$(date +%s)

  # Snapshot pre-run state
  pre_run_count=$(jq -r '.run_count' .brn/state.json 2>/dev/null)
  expected_run_dir=".brn/history/runs/run-$(printf '%03d' $((pre_run_count + 1)))"

  echo "[$(date '+%H:%M:%S')] ━━━ Run $run starting ━━━" | tee -a "$LOGFILE"

  claude -p \
    --model opus \
    --dangerously-skip-permissions \
    --max-turns 100 \
    "/step" 2>&1 | tee -a "$LOGFILE"

  RUN_END=$(date +%s)
  RUN_DURATION=$((RUN_END - RUN_START))

  status=$(jq -r '.status' .brn/state.json 2>/dev/null)
  blocked=$(jq -r '.blocked' .brn/state.json 2>/dev/null)
  ac_progress=$(jq '[.acceptance_criteria[] | select(.met == true)] | length' .brn/state.json 2>/dev/null)
  ac_total=$(jq '.acceptance_criteria | length' .brn/state.json 2>/dev/null)
  run_count=$(jq -r '.run_count' .brn/state.json 2>/dev/null)
  vault_count=$(find .brn/vault -name '*.md' 2>/dev/null | wc -l | tr -d ' ')

  echo "[$(date '+%H:%M:%S')] Run $run finished in ${RUN_DURATION}s | AC: $ac_progress/$ac_total | Vault: $vault_count entries | Status: $status" | tee -a "$LOGFILE"

  # ━━━ PROTOCOL ENFORCEMENT ━━━

  run_ok=true

  # Check 1: Run directory must exist with required files
  if [ ! -d "$expected_run_dir" ]; then
    echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Run directory $expected_run_dir does not exist" | tee -a "$LOGFILE"
    run_ok=false
  else
    # Check prompt.md exists (Thinker must craft a prompt)
    if [ ! -f "$expected_run_dir/prompt.md" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Missing $expected_run_dir/prompt.md — Thinker did not craft a Builder prompt" | tee -a "$LOGFILE"
      run_ok=false
    fi
    # Check output.md exists (Builder output must be captured)
    if [ ! -f "$expected_run_dir/output.md" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Missing $expected_run_dir/output.md — Builder output not captured" | tee -a "$LOGFILE"
      run_ok=false
    fi
    # Check narrative.md exists
    if [ ! -f "$expected_run_dir/narrative.md" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Missing $expected_run_dir/narrative.md — run not narrated" | tee -a "$LOGFILE"
      run_ok=false
    fi
    # Check verification.md exists
    if [ ! -f "$expected_run_dir/verification.md" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Missing $expected_run_dir/verification.md — no independent verification" | tee -a "$LOGFILE"
      run_ok=false
    fi
    # Check meta.json exists
    if [ ! -f "$expected_run_dir/meta.json" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Missing $expected_run_dir/meta.json — run metadata not recorded" | tee -a "$LOGFILE"
      run_ok=false
    fi
  fi

  # Check 2: Git must be clean after each run (everything committed)
  git_dirty=$(git status --porcelain 2>/dev/null | grep -v '\.brn/nightshift\.log' | head -1)
  if [ -n "$git_dirty" ]; then
    echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Git worktree is dirty after run — uncommitted changes detected:" | tee -a "$LOGFILE"
    git status --porcelain 2>/dev/null | grep -v '\.brn/nightshift\.log' | head -10 | tee -a "$LOGFILE"
    run_ok=false
  fi

  # Check 3: No rogue files in project root
  rogue_files=$(find . -maxdepth 1 -name 'brn-*' -o -name 'test-*.html' 2>/dev/null | head -5)
  if [ -n "$rogue_files" ]; then
    echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Rogue files detected in project root:" | tee -a "$LOGFILE"
    echo "$rogue_files" | tee -a "$LOGFILE"
    run_ok=false
  fi

  # Check 4: run_count must have incremented
  post_run_count=$(jq -r '.run_count' .brn/state.json 2>/dev/null)
  if [ "$post_run_count" = "$pre_run_count" ]; then
    echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: run_count did not increment ($pre_run_count -> $post_run_count)" | tee -a "$LOGFILE"
    run_ok=false
  fi

  if [ "$run_ok" = false ]; then
    violations=$((violations + 1))
    echo "[$(date '+%H:%M:%S')] ⚠ Protocol violations this session: $violations" | tee -a "$LOGFILE"

    # After 3 consecutive violations, stop — the /step skill is misbehaving
    if [ $violations -ge 3 ]; then
      echo "[$(date '+%H:%M:%S')] ✗ STOPPING: $violations protocol violations. The /step skill is not following the Thinker/Builder protocol." | tee -a "$LOGFILE"
      echo "Review .brn/nightshift.log, fix the /step skill, and restart /nightshift." | tee -a "$LOGFILE"
      osascript -e 'display notification "Night shift stopped: protocol violations." with title "BRN"' 2>/dev/null
      break
    fi
  else
    # Reset violation counter on a clean run
    violations=0
  fi

  # ━━━ END PROTOCOL ENFORCEMENT ━━━

  if [ "$status" = "done" ]; then
    # Check 5: PR must exist when feature is done
    pr_exists=$(gh pr list --head "feat/$FEATURE" --json number --jq '.[0].number' 2>/dev/null)
    if [ -z "$pr_exists" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠ PROTOCOL VIOLATION: Feature is done but no PR was created" | tee -a "$LOGFILE"
      echo "[$(date '+%H:%M:%S')] Attempting PR creation..." | tee -a "$LOGFILE"
      git push -u origin "feat/$FEATURE" 2>&1 | tee -a "$LOGFILE"
      gh pr create \
        --title "feat: $FEATURE" \
        --body "Automated PR created by BRN nightshift. Review .brn/history/ for run details." \
        2>&1 | tee -a "$LOGFILE"
    fi

    TOTAL_DURATION=$(( $(date +%s) - START_TIME ))
    echo "" | tee -a "$LOGFILE"
    echo "[$(date '+%H:%M:%S')] ✓ FEATURE COMPLETE in $run runs (${TOTAL_DURATION}s total)" | tee -a "$LOGFILE"
    echo "Protocol violations during session: $violations" | tee -a "$LOGFILE"
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
echo "Protocol violations: $violations" | tee -a "$LOGFILE"
