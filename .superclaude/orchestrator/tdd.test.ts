import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  findTestFiles,
  runTests,
  runFullTestSuite,
  enforceTDDPhase,
  parseFailingTestNames,
  captureBaselineSnapshot,
  saveBaselineSnapshot,
  loadBaselineSnapshot,
  compareAgainstBaseline,
} from "./tdd.ts";
import type { TDDSequence } from "./types.ts";
import type { BaselineTestSnapshot, TestResult } from "./tdd.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-tdd";
const SRC_DIR = `${TEST_ROOT}/src`;

beforeEach(() => {
  mkdirSync(`${SRC_DIR}/features/auth`, { recursive: true });
  mkdirSync(`${SRC_DIR}/__tests__`, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── findTestFiles ──────────────────────────────────────────────

describe("findTestFiles", () => {
  test("finds test files from TDD sequence", async () => {
    const testFile = `${SRC_DIR}/features/auth/auth.test.ts`;
    writeFileSync(testFile, 'import { test } from "bun:test";\ntest("noop", () => {});');

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["should generate token"],
      implementationFiles: ["src/features/auth/auth.ts"],
    };

    const found = await findTestFiles(TEST_ROOT, sequence);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("auth.test.ts");
  });

  test("returns empty array when test files don't exist", async () => {
    const sequence: TDDSequence = {
      testFiles: ["src/nonexistent.test.ts"],
      testCases: [],
      implementationFiles: [],
    };

    const found = await findTestFiles(TEST_ROOT, sequence);
    expect(found).toHaveLength(0);
  });

  test("finds multiple test files", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      'import { test } from "bun:test";\ntest("a", () => {});'
    );
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.integration.test.ts`,
      'import { test } from "bun:test";\ntest("b", () => {});'
    );

    const sequence: TDDSequence = {
      testFiles: [
        "src/features/auth/auth.test.ts",
        "src/features/auth/auth.integration.test.ts",
      ],
      testCases: [],
      implementationFiles: [],
    };

    const found = await findTestFiles(TEST_ROOT, sequence);
    expect(found).toHaveLength(2);
  });
});

// ─── runTests ───────────────────────────────────────────────────

describe("runTests", () => {
  test("returns passing result when tests pass", async () => {
    const testFile = `${SRC_DIR}/passing.test.ts`;
    writeFileSync(
      testFile,
      `import { test, expect } from "bun:test";
test("passes", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const result = await runTests(TEST_ROOT, [testFile]);
    expect(result.passing).toBe(true);
    expect(result.totalTests).toBeGreaterThan(0);
    expect(result.failedTests).toBe(0);
  });

  test("returns failing result when tests fail", async () => {
    const testFile = `${SRC_DIR}/failing.test.ts`;
    writeFileSync(
      testFile,
      `import { test, expect } from "bun:test";
test("fails", () => {
  expect(1 + 1).toBe(3);
});`
    );

    const result = await runTests(TEST_ROOT, [testFile]);
    expect(result.passing).toBe(false);
    expect(result.failedTests).toBeGreaterThan(0);
  });

  test("captures test output", async () => {
    const testFile = `${SRC_DIR}/output.test.ts`;
    writeFileSync(
      testFile,
      `import { test, expect } from "bun:test";
test("check output", () => {
  expect(true).toBe(true);
});`
    );

    const result = await runTests(TEST_ROOT, [testFile]);
    expect(result.output).toBeDefined();
    expect(typeof result.output).toBe("string");
  });
});

// ─── runFullTestSuite ───────────────────────────────────────────

describe("runFullTestSuite", () => {
  test("runs all tests in project with per-file isolation", async () => {
    writeFileSync(
      `${SRC_DIR}/a.test.ts`,
      `import { test, expect } from "bun:test";
test("a", () => { expect(true).toBe(true); });`
    );
    writeFileSync(
      `${SRC_DIR}/b.test.ts`,
      `import { test, expect } from "bun:test";
test("b", () => { expect(true).toBe(true); });`
    );

    const result = await runFullTestSuite(TEST_ROOT);
    expect(result.passing).toBe(true);
    expect(result.totalTests).toBeGreaterThanOrEqual(2);
  });

  test("detects failure in full suite", async () => {
    writeFileSync(
      `${SRC_DIR}/good.test.ts`,
      `import { test, expect } from "bun:test";
test("good", () => { expect(true).toBe(true); });`
    );
    writeFileSync(
      `${SRC_DIR}/bad.test.ts`,
      `import { test, expect } from "bun:test";
test("bad", () => { expect(true).toBe(false); });`
    );

    const result = await runFullTestSuite(TEST_ROOT);
    expect(result.passing).toBe(false);
  });

  test("returns passing with zero tests when no test files exist", async () => {
    // Empty project — no test files
    const emptyRoot = "/tmp/superclaude-test-tdd-empty";
    mkdirSync(emptyRoot, { recursive: true });
    try {
      const result = await runFullTestSuite(emptyRoot);
      // No test files found = passing (nothing to fail)
      expect(result.totalTests).toBe(0);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  test("isolates test files from each other (per-file subprocess)", async () => {
    // File A sets a global, File B checks it doesn't leak
    writeFileSync(
      `${SRC_DIR}/setter.test.ts`,
      `import { test, expect } from "bun:test";
(globalThis as any).__testLeak = "leaked";
test("setter", () => { expect(true).toBe(true); });`
    );
    writeFileSync(
      `${SRC_DIR}/checker.test.ts`,
      `import { test, expect } from "bun:test";
test("checker - no leak from other file", () => {
  expect((globalThis as any).__testLeak).toBeUndefined();
});`
    );

    const result = await runFullTestSuite(TEST_ROOT);
    expect(result.passing).toBe(true);
    expect(result.totalTests).toBe(2);
  });
});

// ─── enforceTDDPhase ────────────────────────────────────────────

describe("enforceTDDPhase", () => {
  test("IMPLEMENT: succeeds when test files exist and tests pass", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("auth token", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["auth token"],
      implementationFiles: ["src/features/auth/auth.ts"],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("IMPLEMENT");
  });

  test("IMPLEMENT: fails when no test files found", async () => {
    const sequence: TDDSequence = {
      testFiles: ["src/nonexistent.test.ts"],
      testCases: [],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no test");
  });

  test("IMPLEMENT: verify-only strategy skips TDD entirely", async () => {
    // No test files created — verify-only should pass anyway
    const sequence: TDDSequence = {
      testFiles: ["src/nonexistent.test.ts"],
      testCases: [],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence, "verify-only");
    expect(result.passed).toBe(true);
    expect(result.message).toContain("verify-only");
  });

  test("IMPLEMENT: test-after strategy still requires tests to exist and pass", async () => {
    const sequence: TDDSequence = {
      testFiles: ["src/nonexistent.test.ts"],
      testCases: [],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence, "test-after");
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no test");
  });

  test("IMPLEMENT: test-after strategy succeeds when tests exist and pass", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("auth token", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["auth token"],
      implementationFiles: ["src/features/auth/auth.ts"],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence, "test-after");
    expect(result.passed).toBe(true);
  });

  test("IMPLEMENT: tdd-strict strategy is the default behavior", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("auth token", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["auth token"],
      implementationFiles: ["src/features/auth/auth.ts"],
    };

    // No strategy param = default tdd-strict
    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("IMPLEMENT");
  });

  test("IMPLEMENT: fails when tests fail", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("still failing", () => {
  expect(1).toBe(2);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["still failing"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("IMPLEMENT", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("failing");
  });

});

// ─── Baseline Test Tracking ─────────────────────────────────────

describe("parseFailingTestNames", () => {
  test("extracts failing test names from bun output", () => {
    const output = `
(fail) b fails
(fail) auth rejects expired token

 1 pass
 2 fail
`;
    const names = parseFailingTestNames(output);
    expect(names).toEqual(["b fails", "auth rejects expired token"]);
  });

  test("returns empty array when no failures", () => {
    const output = `
 3 pass
 0 fail
`;
    const names = parseFailingTestNames(output);
    expect(names).toHaveLength(0);
  });

  test("handles single failure", () => {
    const output = `(fail) only one`;
    const names = parseFailingTestNames(output);
    expect(names).toEqual(["only one"]);
  });
});

describe("compareAgainstBaseline", () => {
  test("identifies new regressions not in baseline", () => {
    const baseline: BaselineTestSnapshot = {
      timestamp: "2026-03-20T00:00:00Z",
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      failingTestNames: ["auth rejects expired token"],
    };

    const currentResult: TestResult = {
      passing: false,
      totalTests: 10,
      passedTests: 8,
      failedTests: 2,
      output: "(fail) auth rejects expired token\n(fail) card creation fails\n 8 pass\n 2 fail",
    };

    const comparison = compareAgainstBaseline(currentResult, baseline);
    expect(comparison.regressionCount).toBe(1);
    expect(comparison.newFailures).toEqual(["card creation fails"]);
    expect(comparison.preExisting).toEqual(["auth rejects expired token"]);
  });

  test("returns zero regressions when all failures are pre-existing", () => {
    const baseline: BaselineTestSnapshot = {
      timestamp: "2026-03-20T00:00:00Z",
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      failingTestNames: ["auth rejects expired token"],
    };

    const currentResult: TestResult = {
      passing: false,
      totalTests: 10,
      passedTests: 9,
      failedTests: 1,
      output: "(fail) auth rejects expired token\n 9 pass\n 1 fail",
    };

    const comparison = compareAgainstBaseline(currentResult, baseline);
    expect(comparison.regressionCount).toBe(0);
    expect(comparison.newFailures).toHaveLength(0);
    expect(comparison.preExisting).toEqual(["auth rejects expired token"]);
  });

  test("treats all failures as regressions when baseline has none", () => {
    const baseline: BaselineTestSnapshot = {
      timestamp: "2026-03-20T00:00:00Z",
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      failingTestNames: [],
    };

    const currentResult: TestResult = {
      passing: false,
      totalTests: 10,
      passedTests: 8,
      failedTests: 2,
      output: "(fail) new bug A\n(fail) new bug B\n 8 pass\n 2 fail",
    };

    const comparison = compareAgainstBaseline(currentResult, baseline);
    expect(comparison.regressionCount).toBe(2);
    expect(comparison.newFailures).toEqual(["new bug A", "new bug B"]);
  });
});

describe("saveBaselineSnapshot / loadBaselineSnapshot", () => {
  test("roundtrip: save and load baseline snapshot", async () => {
    const snapshot: BaselineTestSnapshot = {
      timestamp: "2026-03-20T00:00:00Z",
      totalTests: 50,
      passedTests: 49,
      failedTests: 1,
      failingTestNames: ["auth rejects expired token"],
    };

    mkdirSync(`${TEST_ROOT}/slice-dir`, { recursive: true });
    await saveBaselineSnapshot(TEST_ROOT, "slice-dir", snapshot);
    const loaded = await loadBaselineSnapshot(TEST_ROOT, "slice-dir");

    expect(loaded).not.toBeNull();
    expect(loaded!.totalTests).toBe(50);
    expect(loaded!.failedTests).toBe(1);
    expect(loaded!.failingTestNames).toEqual(["auth rejects expired token"]);
  });

  test("loadBaselineSnapshot returns null when no baseline exists", async () => {
    const loaded = await loadBaselineSnapshot(TEST_ROOT, "nonexistent-dir");
    expect(loaded).toBeNull();
  });
});

describe("captureBaselineSnapshot", () => {
  test("captures snapshot from current test suite", async () => {
    writeFileSync(
      `${SRC_DIR}/baseline-pass.test.ts`,
      `import { test, expect } from "bun:test";
test("passes", () => { expect(true).toBe(true); });`
    );

    const snapshot = await captureBaselineSnapshot(TEST_ROOT);
    expect(snapshot.totalTests).toBeGreaterThanOrEqual(1);
    expect(snapshot.timestamp).toBeDefined();
    expect(Array.isArray(snapshot.failingTestNames)).toBe(true);
  });
});
