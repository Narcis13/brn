---
task: T04
slice: S05
milestone: M001
status: pending
strategy: tdd-strict
complexity: complex
---

## Goal
API Error Handling & Token Expiration

**Goal:** Add centralized API error handling with automatic logout on token expiration

#### TDD Sequence
- Test file(s): playground/src/client/api/client.test.ts
- Test cases: API client handles 401 responses, calls logout on token expiration, retries failed requests, shows user-friendly error messages
- Implementation file(s): playground/src/client/api/client.ts

#### Must-Haves
**Truths:**
- All API calls go through centralized client
- 401 responses trigger automatic logout
- Network errors show user-friendly messages
- Failed requests can be retried
- Token is included in all authenticated requests

**Artifacts:**
- playground/src/client/api/client.ts — API client with error handling, 100+ lines, exports apiClient
- playground/src/client/api/client.test.ts — test file, 80+ lines

**Key Links:**
- All api/*.ts files import and use apiClient
- apiClient imports getToken and clearToken from api/auth.ts
- Error handler accesses auth context for logout

#### Must-NOT-Haves
- Do not implement request queuing
- Do not add offline support
- Do not implement request caching
- Do not add retry with exponential backoff
