import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  findTestFiles,
  runTests,
  runFullTestSuite,
  enforceTDDPhase,
} from "./tdd.ts";
import type { TDDSequence } from "./types.ts";
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
  test("runs all tests in project", async () => {
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
});

// ─── enforceTDDPhase ────────────────────────────────────────────

describe("enforceTDDPhase", () => {
  test("RED: succeeds when test files exist and tests fail", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("auth token", () => {
  expect(true).toBe(false); // intentionally fail
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["auth token"],
      implementationFiles: ["src/features/auth/auth.ts"],
    };

    const result = await enforceTDDPhase("RED", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("RED");
  });

  test("RED: fails when no test files found", async () => {
    const sequence: TDDSequence = {
      testFiles: ["src/nonexistent.test.ts"],
      testCases: [],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("RED", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("no test");
  });

  test("RED: fails when tests pass (not testing new behavior)", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("trivially passes", () => {
  expect(true).toBe(true);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["trivially passes"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("RED", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("pass");
  });

  test("GREEN: succeeds when tests pass", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("passes now", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["passes now"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("GREEN", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("GREEN");
  });

  test("GREEN: fails when tests still fail", async () => {
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

    const result = await enforceTDDPhase("GREEN", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("fail");
  });

  test("REFACTOR: succeeds when tests still pass", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("still passes after refactor", () => {
  expect(2 + 2).toBe(4);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["still passes after refactor"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("REFACTOR", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("REFACTOR");
  });

  test("REFACTOR: fails when tests break", async () => {
    writeFileSync(
      `${SRC_DIR}/features/auth/auth.test.ts`,
      `import { test, expect } from "bun:test";
test("broke during refactor", () => {
  expect(1).toBe(999);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/features/auth/auth.test.ts"],
      testCases: ["broke during refactor"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("REFACTOR", TEST_ROOT, sequence);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("broke");
  });

  test("VERIFY: succeeds when full suite passes", async () => {
    writeFileSync(
      `${SRC_DIR}/verify.test.ts`,
      `import { test, expect } from "bun:test";
test("all good", () => {
  expect(true).toBe(true);
});`
    );

    const sequence: TDDSequence = {
      testFiles: ["src/verify.test.ts"],
      testCases: ["all good"],
      implementationFiles: [],
    };

    const result = await enforceTDDPhase("VERIFY", TEST_ROOT, sequence);
    expect(result.passed).toBe(true);
    expect(result.phase).toBe("VERIFY");
  });
});
