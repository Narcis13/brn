---
title: Schema-Code Alignment
type: learning
source: M001/S03
tags: [database, typescript, schema, naming]
---

## Problem
TypeScript review flagged "Column name mismatch between schema and types" causing potential runtime errors.

## Root Cause
Database migration used `column_name` while TypeScript interface used `column` - inconsistent naming conventions.

## Fix
Database schema and TypeScript interfaces MUST use identical property names. Always verify schema matches types before implementation.

## Impact
This mismatch would cause runtime errors when accessing card.column from database results.