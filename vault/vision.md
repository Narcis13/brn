# Vision

## Project

SUPER_CODEX is a recovery-first orchestration system for AI coding work that keeps project intent, work state, and recovery data on disk instead of inside one fragile chat session.

## Why It Matters

- Operators should be able to start, pause, and resume long-running coding work with minimal babysitting.
- Agent quality should improve because the control plane decides state, routing, and recovery deterministically.
- A new agent instance should be able to recover from disk without hidden prompt history.

## Success Signals

- A fresh agent instance can infer the correct next unit from `vault/` and `.supercodex/state/`.
- The system can survive interruption and continue from local artifacts with no hidden chat dependency.
- Planning, queueing, and safety boundaries are inspectable in Git-friendly files.
