---
title: Schema-Code Alignment
type: learning
source: M001/S03
created: 2026-03-20
tags: [database, typescript, naming, consistency]
---

## The Problem
Database schema uses `column_name` while TypeScript interface uses `column`, causing mapping bugs in every repository function.

## Root Cause
Schema and code designed independently without naming convention agreement.

## Solution
Always align database column names with TypeScript property names:
- If DB uses snake_case, use it consistently
- If TS uses camelCase, map at repository boundary
- Document the convention in CLAUDE.md

## Action Items
- Define naming convention before creating schema
- Validate schema matches types in T01 of any slice
- Use a single source of truth for field names