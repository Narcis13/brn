# Global Test Mocks Anti-Pattern

## Problem
Using `global.eventBus = mockEventBus` or similar global mocks in test files can cause tests to interfere with each other, leading to flaky or failing tests.

## Solution
1. Remove test files that use global mocks
2. Initialize real dependencies in test setup
3. Use proper test isolation with beforeEach/afterEach

## Context
Discovered when activity-subscriber.test.ts was mocking global.eventBus, causing other tests to fail when they expected the real event bus.

## Confidence
verified