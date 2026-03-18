/**
 * SUPER_CLAUDE — TDD Enforcement Engine
 * Test detection, test running, and TDD phase enforcement.
 */

import type { TDDSequence, TDDSubPhase } from "./types.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface TestResult {
  passing: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  output: string;
}

export interface TDDPhaseResult {
  passed: boolean;
  phase: TDDSubPhase;
  message: string;
  testResult: TestResult | null;
}

// ─── Find Test Files ────────────────────────────────────────────

/**
 * Given a TDD sequence, return absolute paths of test files that exist on disk.
 */
export async function findTestFiles(
  projectRoot: string,
  sequence: TDDSequence
): Promise<string[]> {
  const found: string[] = [];

  for (const relativePath of sequence.testFiles) {
    const absPath = `${projectRoot}/${relativePath}`;
    const file = Bun.file(absPath);
    if (await file.exists()) {
      found.push(absPath);
    }
  }

  return found;
}

// ─── Run Tests ──────────────────────────────────────────────────

/**
 * Run bun test on specific test files and return structured results.
 */
export async function runTests(
  projectRoot: string,
  testFiles: string[]
): Promise<TestResult> {
  if (testFiles.length === 0) {
    return {
      passing: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      output: "No test files provided.",
    };
  }

  const fileArgs = testFiles.join(" ");

  try {
    const proc = Bun.spawn(["bun", "test", ...testFiles], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + stderr;

    return parseTestOutput(output, exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passing: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      output: `Test execution error: ${message}`,
    };
  }
}

/**
 * Run the full test suite for the project.
 */
export async function runFullTestSuite(projectRoot: string): Promise<TestResult> {
  try {
    const proc = Bun.spawn(["bun", "test"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + stderr;

    return parseTestOutput(output, exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      passing: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      output: `Test execution error: ${message}`,
    };
  }
}

// ─── TDD Phase Enforcement ──────────────────────────────────────

/**
 * Enforce TDD rules for a given sub-phase.
 *
 * RED:      Tests must exist AND must FAIL
 * GREEN:    Tests must PASS
 * REFACTOR: Tests must still PASS
 * VERIFY:   Full test suite must PASS
 */
export async function enforceTDDPhase(
  phase: TDDSubPhase,
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  switch (phase) {
    case "RED":
      return enforceRed(projectRoot, sequence);
    case "GREEN":
      return enforceGreen(projectRoot, sequence);
    case "REFACTOR":
      return enforceRefactor(projectRoot, sequence);
    case "VERIFY":
      return enforceVerify(projectRoot, sequence);
  }
}

async function enforceRed(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  // 1. Test files must exist
  const testFiles = await findTestFiles(projectRoot, sequence);
  if (testFiles.length === 0) {
    return {
      passed: false,
      phase: "RED",
      message: "RED phase produced no test files — no test files found on disk.",
      testResult: null,
    };
  }

  // 2. Tests must FAIL (they test behavior that doesn't exist yet)
  const testResult = await runTests(projectRoot, testFiles);
  if (testResult.passing) {
    return {
      passed: false,
      phase: "RED",
      message:
        "RED phase tests pass immediately — they are not testing new behavior. " +
        "Tests in RED phase must FAIL to prove they cover unimplemented functionality.",
      testResult,
    };
  }

  return {
    passed: true,
    phase: "RED",
    message: `RED phase OK: ${testFiles.length} test file(s) found, tests fail as expected.`,
    testResult,
  };
}

async function enforceGreen(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  const testFiles = await findTestFiles(projectRoot, sequence);
  const testResult = await runTests(projectRoot, testFiles);

  if (!testResult.passing) {
    return {
      passed: false,
      phase: "GREEN",
      message: `GREEN phase: tests still fail. ${testResult.failedTests} test(s) failing.`,
      testResult,
    };
  }

  return {
    passed: true,
    phase: "GREEN",
    message: `GREEN phase OK: all ${testResult.totalTests} test(s) passing.`,
    testResult,
  };
}

async function enforceRefactor(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  const testFiles = await findTestFiles(projectRoot, sequence);
  const testResult = await runTests(projectRoot, testFiles);

  if (!testResult.passing) {
    return {
      passed: false,
      phase: "REFACTOR",
      message: `REFACTOR phase: refactoring broke tests. ${testResult.failedTests} test(s) now failing. Revert the refactor.`,
      testResult,
    };
  }

  return {
    passed: true,
    phase: "REFACTOR",
    message: `REFACTOR phase OK: all ${testResult.totalTests} test(s) still passing after refactor.`,
    testResult,
  };
}

async function enforceVerify(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  // VERIFY runs the full test suite, not just this task's tests
  const fullResult = await runFullTestSuite(projectRoot);

  if (!fullResult.passing) {
    return {
      passed: false,
      phase: "VERIFY",
      message: `VERIFY phase: full test suite has failures. ${fullResult.failedTests} test(s) failing.`,
      testResult: fullResult,
    };
  }

  return {
    passed: true,
    phase: "VERIFY",
    message: `VERIFY phase OK: full test suite passing (${fullResult.totalTests} tests).`,
    testResult: fullResult,
  };
}

// ─── Output Parsing ─────────────────────────────────────────────

function parseTestOutput(output: string, exitCode: number): TestResult {
  // Parse bun test output format:
  // "X pass" and "Y fail" lines
  const passMatch = output.match(/(\d+)\s+pass/);
  const failMatch = output.match(/(\d+)\s+fail/);

  const passedTests = passMatch?.[1] ? parseInt(passMatch[1], 10) : 0;
  const failedTests = failMatch?.[1] ? parseInt(failMatch[1], 10) : 0;
  const totalTests = passedTests + failedTests;

  return {
    passing: exitCode === 0 && failedTests === 0 && totalTests > 0,
    totalTests,
    passedTests,
    failedTests,
    output,
  };
}
