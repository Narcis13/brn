---
title: JWT Storage Security Considerations
type: learning
source: M001/S04
tags: [security, authentication, jwt, frontend]
---

## Problem
JWT tokens stored in localStorage are vulnerable to XSS attacks.

## Root Cause
localStorage is accessible to any JavaScript code running on the page, including injected malicious scripts.

## Fix
For production apps, consider httpOnly cookies or implement additional XSS protections like Content Security Policy.

## Trade-offs
- localStorage: Simple but XSS vulnerable
- httpOnly cookies: XSS safe but requires CSRF protection
- Memory only: Most secure but doesn't persist across refreshes