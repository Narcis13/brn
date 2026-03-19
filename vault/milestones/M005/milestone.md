# M005: TDD and Verification Pipeline

## Objective

Enforce task-level TDD modes, verification ladders, reviewer passes, and completion artifacts so the conductor stops trusting unsupported completion claims.

## Why Now

Next-action synthesis is only credible if successful task execution can be proven through deterministic verification artifacts and reviewer checkpoints instead of runtime self-report.

## Exit Criteria

- Tasks declare a valid TDD mode and verification plan.
- Successful implementation runs route into verifier and reviewer passes deterministically.
- Verification, review, completion, and slice UAT artifacts are written to disk.
- Failed or missing verifier and reviewer artifacts force recovery instead of silent completion.
