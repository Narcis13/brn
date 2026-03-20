import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import {
  verifyFileExists,
  verifyMinimumSubstance,
  verifyExports,
  verifyImportLink,
  detectStubs,
  verifyMustHaves,
  runTypeCheck,
  runLinter,
  runCommandVerification,
  preflight,
} from "./verify.ts";
import type { MustHaves } from "./types.ts";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";

const TEST_ROOT = "/tmp/superclaude-test-verify";
const SRC_DIR = `${TEST_ROOT}/src`;

beforeEach(() => {
  mkdirSync(SRC_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ─── verifyFileExists ───────────────────────────────────────────

describe("verifyFileExists", () => {
  test("passes when file exists", async () => {
    writeFileSync(`${SRC_DIR}/auth.ts`, "export const x = 1;");
    const result = await verifyFileExists(`${SRC_DIR}/auth.ts`);
    expect(result.passed).toBe(true);
  });

  test("fails when file does not exist", async () => {
    const result = await verifyFileExists(`${SRC_DIR}/nope.ts`);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });
});

// ─── verifyMinimumSubstance ─────────────────────────────────────

describe("verifyMinimumSubstance", () => {
  test("passes when file meets minimum line count", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`);
    writeFileSync(`${SRC_DIR}/auth.ts`, lines.join("\n"));

    const result = await verifyMinimumSubstance(`${SRC_DIR}/auth.ts`, 30);
    expect(result.passed).toBe(true);
  });

  test("fails when file is too short", async () => {
    writeFileSync(`${SRC_DIR}/stub.ts`, "export const x = 1;\n");

    const result = await verifyMinimumSubstance(`${SRC_DIR}/stub.ts`, 30);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("lines");
  });

  test("fails when file does not exist", async () => {
    const result = await verifyMinimumSubstance(`${SRC_DIR}/nope.ts`, 10);
    expect(result.passed).toBe(false);
  });
});

// ─── verifyExports ──────────────────────────────────────────────

describe("verifyExports", () => {
  test("passes when all required exports are present", async () => {
    writeFileSync(
      `${SRC_DIR}/auth.ts`,
      `export function generateToken() { return "tok"; }
export function verifyToken() { return true; }
export const AUTH_SECRET = "secret";`
    );

    const result = await verifyExports(`${SRC_DIR}/auth.ts`, [
      "generateToken",
      "verifyToken",
    ]);
    expect(result.passed).toBe(true);
  });

  test("fails when an export is missing", async () => {
    writeFileSync(
      `${SRC_DIR}/auth.ts`,
      `export function generateToken() { return "tok"; }`
    );

    const result = await verifyExports(`${SRC_DIR}/auth.ts`, [
      "generateToken",
      "verifyToken",
    ]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("verifyToken");
  });

  test("detects export default", async () => {
    writeFileSync(
      `${SRC_DIR}/handler.ts`,
      `export default function handler() { return "ok"; }`
    );

    const result = await verifyExports(`${SRC_DIR}/handler.ts`, ["default"]);
    expect(result.passed).toBe(true);
  });

  test("detects named exports with 'as'", async () => {
    writeFileSync(
      `${SRC_DIR}/lib.ts`,
      `function internal() { return 1; }
export { internal as myExport };`
    );

    const result = await verifyExports(`${SRC_DIR}/lib.ts`, ["myExport"]);
    expect(result.passed).toBe(true);
  });
});

// ─── verifyImportLink ───────────────────────────────────────────

describe("verifyImportLink", () => {
  test("passes when import exists", async () => {
    writeFileSync(
      `${SRC_DIR}/route.ts`,
      `import { generateToken } from "./auth";
export function login() { return generateToken(); }`
    );

    const result = await verifyImportLink(
      `${SRC_DIR}/route.ts`,
      "generateToken",
      "./auth"
    );
    expect(result.passed).toBe(true);
  });

  test("fails when import is missing", async () => {
    writeFileSync(
      `${SRC_DIR}/route.ts`,
      `export function login() { return "hardcoded"; }`
    );

    const result = await verifyImportLink(
      `${SRC_DIR}/route.ts`,
      "generateToken",
      "./auth"
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("generateToken");
  });

  test("handles re-exports and type imports", async () => {
    writeFileSync(
      `${SRC_DIR}/index.ts`,
      `import type { User } from "./types";
export type { User };`
    );

    const result = await verifyImportLink(
      `${SRC_DIR}/index.ts`,
      "User",
      "./types"
    );
    expect(result.passed).toBe(true);
  });
});

// ─── detectStubs ────────────────────────────────────────────────

describe("detectStubs", () => {
  test("detects TODO comments", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function doWork() {
  // TODO: implement this
  return null;
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
    expect(result.stubs.length).toBeGreaterThan(0);
    expect(result.stubs.some((s) => s.pattern === "TODO")).toBe(true);
  });

  test("detects FIXME comments", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function doWork() {
  // FIXME: broken
  return [];
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
    expect(result.stubs.some((s) => s.pattern === "FIXME")).toBe(true);
  });

  test("detects return null as placeholder", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function getData(): string | null {
  return null;
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
    expect(result.stubs.some((s) => s.pattern === "return null")).toBe(true);
  });

  test("detects return {} as placeholder", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function getConfig() {
  return {};
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
    expect(result.stubs.some((s) => s.pattern === "return {}")).toBe(true);
  });

  test("detects return [] as placeholder", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function getItems() {
  return [];
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
  });

  test("detects throw not implemented", async () => {
    writeFileSync(
      `${SRC_DIR}/impl.ts`,
      `export function doWork() {
  throw new Error("not implemented");
}`
    );

    const result = await detectStubs(`${SRC_DIR}/impl.ts`);
    expect(result.hasStubs).toBe(true);
  });

  test("passes clean implementation", async () => {
    writeFileSync(
      `${SRC_DIR}/clean.ts`,
      `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`
    );

    const result = await detectStubs(`${SRC_DIR}/clean.ts`);
    expect(result.hasStubs).toBe(false);
    expect(result.stubs).toHaveLength(0);
  });
});

// ─── verifyMustHaves ────────────────────────────────────────────

describe("verifyMustHaves", () => {
  test("passes when all must-haves are met", async () => {
    // Create artifact with required exports and substance
    const lines = [
      'export function generateToken(): string { return "jwt.token.here"; }',
      'export function verifyToken(t: string): boolean { return t.startsWith("jwt"); }',
      ...Array.from({ length: 28 }, (_, i) => `// Implementation line ${i}`),
    ];
    writeFileSync(`${SRC_DIR}/auth.ts`, lines.join("\n"));

    // Create file with import link
    writeFileSync(
      `${SRC_DIR}/route.ts`,
      `import { generateToken } from "./auth";
export function login() { return generateToken(); }
// more code
// more code
// more code`
    );

    const mustHaves: MustHaves = {
      truths: ["Login returns JWT token"],
      artifacts: [
        {
          path: "src/auth.ts",
          description: "JWT helpers",
          minLines: 30,
          requiredExports: ["generateToken", "verifyToken"],
        },
      ],
      keyLinks: ["src/route.ts imports generateToken from ./auth"],
    };

    const result = await verifyMustHaves(TEST_ROOT, mustHaves);
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  test("fails when artifact is missing", async () => {
    const mustHaves: MustHaves = {
      truths: [],
      artifacts: [
        {
          path: "src/missing.ts",
          description: "Does not exist",
          minLines: 10,
          requiredExports: ["something"],
        },
      ],
      keyLinks: [],
    };

    const result = await verifyMustHaves(TEST_ROOT, mustHaves);
    expect(result.passed).toBe(false);
  });

  test("fails when artifact has stubs", async () => {
    const lines = [
      "export function getData() {",
      "  // TODO: implement",
      "  return null;",
      "}",
      ...Array.from({ length: 26 }, (_, i) => `// line ${i}`),
    ];
    writeFileSync(`${SRC_DIR}/data.ts`, lines.join("\n"));

    const mustHaves: MustHaves = {
      truths: [],
      artifacts: [
        {
          path: "src/data.ts",
          description: "Data module",
          minLines: 10,
          requiredExports: ["getData"],
        },
      ],
      keyLinks: [],
    };

    const result = await verifyMustHaves(TEST_ROOT, mustHaves);
    expect(result.passed).toBe(false);
    expect(result.checks.some((c) => !c.passed && c.name.includes("stub"))).toBe(true);
  });
});

// ─── Command-Tier Verification (GAP-10) ─────────────────────────

describe("runTypeCheck", () => {
  test("returns a VerificationCheck with type 'command'", async () => {
    // Runs on the actual project root — should have a tsconfig.json
    const result = await runTypeCheck(TEST_ROOT);
    expect(result.type).toBe("command");
    expect(result.name).toBe("typecheck:tsc");
    // May pass or fail depending on project state — just check structure
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});

describe("runLinter", () => {
  test("returns a VerificationCheck with type 'command'", async () => {
    const result = await runLinter(TEST_ROOT);
    expect(result.type).toBe("command");
    expect(result.name).toMatch(/^lint:/);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});

describe("runCommandVerification", () => {
  test("returns array with typecheck and lint results", async () => {
    const results = await runCommandVerification(TEST_ROOT);
    expect(results.length).toBe(2);
    expect(results[0]!.name).toBe("typecheck:tsc");
    expect(results[1]!.name).toMatch(/^lint:/);
    // Both should be command-tier checks
    for (const r of results) {
      expect(r.type).toBe("command");
    }
  });
});

// ─── Pre-flight Validation ──────────────────────────────────────

describe("preflight", () => {
  test("returns ok when no blockers", async () => {
    const state = {
      phase: "EXECUTE_TASK" as const,
      tddSubPhase: "IMPLEMENT" as const,
      currentMilestone: "M001",
      currentSlice: "S01",
      currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };
    const taskPlan = {
      task: "T01", slice: "S01", milestone: "M001", status: "pending" as const,
      goal: "Test", steps: [], mustHaves: { truths: [], artifacts: [], keyLinks: [] },
      mustNotHaves: [], tddSequence: { testFiles: [], testCases: [], implementationFiles: [] },
      strategy: "tdd-strict" as const, complexity: "standard" as const,
    };

    const result = await preflight(TEST_ROOT, state, taskPlan);
    expect(result.ok).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  test("detects path prefix inconsistency between test files and artifacts", async () => {
    const state = {
      phase: "EXECUTE_TASK" as const, tddSubPhase: "IMPLEMENT" as const,
      currentMilestone: "M001", currentSlice: "S01", currentTask: "T01",
      lastUpdated: new Date().toISOString(),
    };
    const taskPlan = {
      task: "T01", slice: "S01", milestone: "M001", status: "pending" as const,
      goal: "Test", steps: [],
      mustHaves: { truths: [], artifacts: [{ path: "playground/src/auth.ts", description: "Auth", minLines: 10, requiredExports: [] }], keyLinks: [] },
      mustNotHaves: [],
      tddSequence: { testFiles: ["src/auth.test.ts"], testCases: [], implementationFiles: [] },
      strategy: "tdd-strict" as const, complexity: "standard" as const,
    };

    const result = await preflight(TEST_ROOT, state, taskPlan);
    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.fixes[0]!.fixed).toBe("playground/src/auth.test.ts");
  });
});
