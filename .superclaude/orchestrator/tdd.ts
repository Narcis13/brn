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
 * Enforce TDD rules for the IMPLEMENT phase.
 * Tests must exist AND must PASS (one-shot: agent wrote tests + implementation).
 * Full suite verification + reviewer quality gate happen at slice level.
 */
export async function enforceTDDPhase(
  phase: TDDSubPhase,
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  return enforceImplement(projectRoot, sequence);
}

async function enforceImplement(
  projectRoot: string,
  sequence: TDDSequence
): Promise<TDDPhaseResult> {
  // 1. Test files must exist
  const testFiles = await findTestFiles(projectRoot, sequence);
  if (testFiles.length === 0) {
    return {
      passed: false,
      phase: "IMPLEMENT",
      message: "IMPLEMENT phase produced no test files — agent must write tests first.",
      testResult: null,
    };
  }

  // 2. Tests must PASS (agent wrote tests + implementation in one shot)
  const testResult = await runTests(projectRoot, testFiles);
  if (!testResult.passing) {
    return {
      passed: false,
      phase: "IMPLEMENT",
      message: `IMPLEMENT phase: ${testResult.failedTests} test(s) still failing. Agent must fix implementation.`,
      testResult,
    };
  }

  return {
    passed: true,
    phase: "IMPLEMENT",
    message: `IMPLEMENT OK: ${testFiles.length} test file(s), all ${testResult.totalTests} test(s) passing.`,
    testResult,
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
