---
title: Focused single-task prompts with complete context
type: prompt
confidence: verified
source: run-003
feature: card-artifacts
created: 2026-03-28
---

## Strategy
Craft prompts that focus on a single, well-defined task (one AC) but provide complete context including:
- Full file contents for files to be modified
- Database function signatures and types
- Existing helper functions that can be reused
- Clear before/after structure showing exactly where changes go

## Result
The Builder completed AC13 in just 2 turns with perfect implementation:
- No exploration or discovery phase needed
- No missing imports or undefined functions
- Tests written correctly on first try
- Exact positioning of new sections as specified

## Lesson
Investing time in the prompt to include all necessary context (file contents, types, helper functions) dramatically reduces Builder turns and produces more accurate results. The Builder doesn't need to explore or guess when given complete information.

## When to Apply
- Single acceptance criteria tasks
- Modifications to existing code
- Tasks with clear insertion points
- When helper functions/utilities already exist in the codebase