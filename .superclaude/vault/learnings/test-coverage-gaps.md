---
title: Test Coverage Gaps  
type: learning
source: M001/S03
tags: [testing, security, coverage]
---

## Problem
Testability review revealed missing tests for `getCardsByBoard` and `getCardById` functions that validate authorization.

## Root Cause
Implementation focused on CRUD operations but missed testing authorization paths in service layer.

## Fix
EVERY public function that validates ownership/authorization MUST have tests verifying:
- Success case for authorized user
- 403 response for unauthorized user  
- 404 response for non-existent resources