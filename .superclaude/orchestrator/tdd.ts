/**
 * SUPER_CLAUDE — TDD Enforcement Engine
 * Test detection, test running, and TDD phase enforcement.
 */

import type { TDDSequence, TDDSubPhase, VerificationStrategy } from "./types.ts";

// ─── Test CWD Resolution ─────────────────────────────────────────

/**
 * Resolve the correct working directory for running a test file.
 * If the test file lives under a subdirectory with its own bunfig.toml
 * (e.g., playground/), use that directory so Bun picks up test preloads
 * and config. Otherwise, use the project root.
 *
 * Accepts both absolute and relative paths.
 */
async function resolveTestCwd(projectRoot: string, testFile: string): Promise<string> {
  // Normalize to absolute path
  const absPath = testFile.startsWith("/") ? testFile : `${projectRoot}/${testFile}`;

  // Walk up from the test file's directory toward projectRoot
  let dir = absPath.substring(0, absPath.lastIndexOf("/"));
  while (dir.length > projectRoot.length) {
    const hasBunfig = await Bun.file(`${dir}/bunfig.toml`).exists();
    if (hasBunfig) {
      return dir;
    }
    dir = dir.substring(0, dir.lastIndexOf("/"));
  }
  return projectRoot;
}

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
 *
 * Each file runs in its own subprocess to prevent Bun mock.module pollution
 * across test files (mock.module is process-global and cannot be un-registered).
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

  // Run each file in its own process to isolate mock.module effects
  let totalPassed = 0;
  let totalFailed = 0;
  const outputs: string[] = [];
  let allPassing = true;

  for (const file of testFiles) {
    try {
      // Resolve the correct cwd: if the test file is under a subdirectory
      // with its own bunfig.toml (e.g., playground/), run from there so
      // Bun picks up test preloads (happy-dom, etc.)
      const cwd = await resolveTestCwd(projectRoot, file);
      // Make test path relative to the resolved cwd
      const absFile = file.startsWith("/") ? file : `${projectRoot}/${file}`;
      const relativeFile = absFile.startsWith(cwd + "/") ? absFile.slice(cwd.length + 1) : file;

      const proc = Bun.spawn(["bun", "test", relativeFile], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      const output = stdout + stderr;
      outputs.push(output);

      const result = parseTestOutput(output, exitCode);
      totalPassed += result.passedTests;
      totalFailed += result.failedTests;
      if (!result.passing) allPassing = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputs.push(`Test execution error for ${file}: ${message}`);
      allPassing = false;
    }
  }

  return {
    passing: allPassing && totalFailed === 0 && (totalPassed + totalFailed) > 0,
    totalTests: totalPassed + totalFailed,
    passedTests: totalPassed,
    failedTests: totalFailed,
    output: outputs.join("\n---\n"),
  };
}

/**
 * Run the full test suite for the project.
 *
 * Discovers all test files and runs each in its own subprocess sequentially
 * (--concurrency 1 equivalent) to prevent database state leaking between
 * test files during slice verification.
 */
export async function runFullTestSuite(projectRoot: string): Promise<TestResult> {
  try {
    // Discover all test files in the project
    const testFiles = await discoverTestFiles(projectRoot);
    if (testFiles.length === 0) {
      return {
        passing: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        output: "No test files found.",
      };
    }

    // Run each file in its own process sequentially for full isolation
    return await runTests(projectRoot, testFiles);
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
 * Discover all test files in a project root using `bun test --list`.
 * Falls back to glob-based discovery if --list is not available.
 */
async function discoverTestFiles(projectRoot: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["bun", "test", "--list"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && (line.endsWith(".test.ts") || line.endsWith(".test.js") || line.endsWith(".spec.ts") || line.endsWith(".spec.js")));

    if (files.length > 0) return files;
  } catch {
    // Fall through to glob-based discovery
  }

  // Fallback: use Bun.Glob to find test files
  const glob = new Bun.Glob("**/*.test.{ts,js}");
  const found: string[] = [];
  for await (const path of glob.scan({ cwd: projectRoot, absolute: true })) {
    if (!path.includes("node_modules")) {
      found.push(path);
    }
  }
  return found;
}

// ─── TDD Phase Enforcement ──────────────────────────────────────

/**
 * Enforce TDD rules for the IMPLEMENT phase.
 * Behavior varies by verification strategy:
 * - `tdd-strict`: Tests must exist AND pass (full RED-GREEN-REFACTOR).
 * - `test-after`: Tests must exist AND pass (implementation first, tests after).
 * - `verify-only`: No test requirement — skip TDD checks entirely.
 */
export async function enforceTDDPhase(
  phase: TDDSubPhase,
  projectRoot: string,
  sequence: TDDSequence,
  strategy: VerificationStrategy = "tdd-strict"
): Promise<TDDPhaseResult> {
  if (strategy === "verify-only") {
    return {
      passed: true,
      phase: "IMPLEMENT",
      message: "IMPLEMENT OK (verify-only): TDD skipped — verified by static checks.",
      testResult: null,
    };
  }

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

// ─── Baseline Test Tracking ─────────────────────────────────────

export interface BaselineTestSnapshot {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  failingTestNames: string[];
}

/**
 * Parse failing test names from bun test output.
 * Bun marks failures as `(fail) test name`.
 */
export function parseFailingTestNames(output: string): string[] {
  const failures: string[] = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^\(fail\)\s+(.+)$/);
    if (match?.[1]) {
      failures.push(match[1].trim());
    }
  }
  return failures;
}

/**
 * Capture a baseline test snapshot by running the full test suite.
 * Returns the snapshot to be saved to disk.
 */
export async function captureBaselineSnapshot(projectRoot: string): Promise<BaselineTestSnapshot> {
  const result = await runFullTestSuite(projectRoot);
  const failingTestNames = parseFailingTestNames(result.output);

  return {
    timestamp: new Date().toISOString(),
    totalTests: result.totalTests,
    passedTests: result.passedTests,
    failedTests: result.failedTests,
    failingTestNames,
  };
}

/**
 * Save a baseline snapshot to disk as JSON.
 */
export async function saveBaselineSnapshot(
  projectRoot: string,
  slicePath: string,
  snapshot: BaselineTestSnapshot
): Promise<void> {
  const path = `${projectRoot}/${slicePath}/BASELINE_TESTS.json`;
  await Bun.write(path, JSON.stringify(snapshot, null, 2));
}

/**
 * Load a baseline snapshot from disk.
 * Returns null if no baseline exists.
 */
export async function loadBaselineSnapshot(
  projectRoot: string,
  slicePath: string
): Promise<BaselineTestSnapshot | null> {
  const path = `${projectRoot}/${slicePath}/BASELINE_TESTS.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  try {
    const content = await file.text();
    return JSON.parse(content) as BaselineTestSnapshot;
  } catch {
    return null;
  }
}

/**
 * Compare current test results against a baseline.
 * Returns only NEW failures (regressions) that weren't in the baseline.
 */
export function compareAgainstBaseline(
  currentResult: TestResult,
  baseline: BaselineTestSnapshot
): { newFailures: string[]; preExisting: string[]; regressionCount: number } {
  const currentFailures = parseFailingTestNames(currentResult.output);
  const baselineSet = new Set(baseline.failingTestNames);

  const newFailures = currentFailures.filter((name) => !baselineSet.has(name));
  const preExisting = currentFailures.filter((name) => baselineSet.has(name));

  return {
    newFailures,
    preExisting,
    regressionCount: newFailures.length,
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
