---
title: Never ship UI components without proper styling
type: anti-pattern
confidence: verified
source: manual (SUPER_CLAUDE M001 postmortem)
created: 2026-03-22
---

## Problem
The autonomous orchestrator produced React components with zero CSS. Tests
passed, types checked, build succeeded — but the UI was unusable. Raw HTML
inputs, no spacing, no visual hierarchy. "It looks terrible."

## Solution
When implementing UI components, styling is NOT optional. Every component must
include baseline styling that makes it look intentional:
- Form inputs: padding, border-radius, proper sizing
- Buttons: distinct primary/secondary styles, hover states
- Layout: spacing, max-widths, centering
- Typography: font sizes, weights, colors for hierarchy
- Feedback states: loading, error, success, empty

A CSS file loaded from HTML is preferred over inline styles for maintainability.

## Context
This was the #1 complaint from the first autonomous coding test. Functional
correctness without visual quality is not "done." Always include styling as
part of the acceptance criteria.
