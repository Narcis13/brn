/**
 * SUPER_CLAUDE — Static Verification Engine
 * Deterministic checks: file existence, exports, imports, stubs, must-haves.
 */

import type { MustHaves, VerificationCheck, VerificationResult } from "./types.ts";

// ─── File Existence ─────────────────────────────────────────────

export async function verifyFileExists(filePath: string): Promise<VerificationCheck> {
  const file = Bun.file(filePath);
  const exists = await file.exists();

  return {
    name: `file-exists:${filePath}`,
    type: "static",
    passed: exists,
    message: exists
      ? `File exists: ${filePath}`
      : `File not found: ${filePath}`,
  };
}

// ─── Minimum Substance ─────────────────────────────────────────

export async function verifyMinimumSubstance(
  filePath: string,
  minLines: number
): Promise<VerificationCheck> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return {
      name: `min-substance:${filePath}`,
      type: "static",
      passed: false,
      message: `File not found: ${filePath}`,
    };
  }

  const content = await file.text();
  const lineCount = content.split("\n").length;

  return {
    name: `min-substance:${filePath}`,
    type: "static",
    passed: lineCount >= minLines,
    message:
      lineCount >= minLines
        ? `File has ${lineCount} lines (minimum: ${minLines})`
        : `File has only ${lineCount} lines, needs at least ${minLines} lines`,
  };
}

// ─── Export Verification ────────────────────────────────────────

export async function verifyExports(
  filePath: string,
  requiredExports: string[]
): Promise<VerificationCheck> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return {
      name: `exports:${filePath}`,
      type: "static",
      passed: false,
      message: `File not found: ${filePath}`,
    };
  }

  const content = await file.text();
  const missing: string[] = [];

  for (const exportName of requiredExports) {
    if (!hasExport(content, exportName)) {
      missing.push(exportName);
    }
  }

  return {
    name: `exports:${filePath}`,
    type: "static",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? `All required exports found: ${requiredExports.join(", ")}`
        : `Missing exports: ${missing.join(", ")}`,
  };
}

function hasExport(content: string, name: string): boolean {
  if (name === "default") {
    return /export\s+default\b/.test(content);
  }

  // export function name / export const name / export class name / export type name / export interface name
  const directExport = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var|class|type|interface|enum)\\s+${escapeRegex(name)}\\b`
  );
  if (directExport.test(content)) return true;

  // export { name } or export { something as name }
  const namedExport = new RegExp(
    `export\\s*\\{[^}]*\\b${escapeRegex(name)}\\b[^}]*\\}`
  );
  if (namedExport.test(content)) return true;

  // export { something as name }
  const aliasExport = new RegExp(
    `export\\s*\\{[^}]*\\bas\\s+${escapeRegex(name)}\\b[^}]*\\}`
  );
  if (aliasExport.test(content)) return true;

  return false;
}

// ─── Import Link Verification ───────────────────────────────────

export async function verifyImportLink(
  sourceFile: string,
  importedSymbol: string,
  fromModule: string
): Promise<VerificationCheck> {
  const file = Bun.file(sourceFile);

  if (!(await file.exists())) {
    return {
      name: `import-link:${sourceFile}`,
      type: "static",
      passed: false,
      message: `Source file not found: ${sourceFile}`,
    };
  }

  const content = await file.text();

  // Match: import { symbol } from "module"
  // Also: import type { symbol } from "module"
  // Also: import { a, symbol, b } from "module"
  const importPattern = new RegExp(
    `import\\s+(?:type\\s+)?\\{[^}]*\\b${escapeRegex(importedSymbol)}\\b[^}]*\\}\\s+from\\s+["']${escapeRegex(fromModule)}["']`
  );

  const found = importPattern.test(content);

  return {
    name: `import-link:${sourceFile}→${importedSymbol}`,
    type: "static",
    passed: found,
    message: found
      ? `Import found: ${importedSymbol} from ${fromModule} in ${sourceFile}`
      : `Missing import: ${importedSymbol} from ${fromModule} not found in ${sourceFile}`,
  };
}

// ─── Stub Detection ─────────────────────────────────────────────

export interface StubInfo {
  pattern: string;
  line: number;
  content: string;
}

export interface StubDetectionResult {
  hasStubs: boolean;
  stubs: StubInfo[];
}

const STUB_PATTERNS: Array<{ pattern: string; regex: RegExp }> = [
  { pattern: "TODO", regex: /\/\/\s*TODO\b/i },
  { pattern: "FIXME", regex: /\/\/\s*FIXME\b/i },
  { pattern: "return null", regex: /^\s*return\s+null\s*;?\s*$/ },
  { pattern: "return {}", regex: /^\s*return\s+\{\s*\}\s*;?\s*$/ },
  { pattern: "return []", regex: /^\s*return\s+\[\s*\]\s*;?\s*$/ },
  { pattern: "not implemented", regex: /throw\s+new\s+Error\s*\(\s*["']not implemented["']/i },
  { pattern: "placeholder", regex: /\/\/\s*placeholder\b/i },
  { pattern: "stub", regex: /\/\/\s*stub\b/i },
  { pattern: "console.log not implemented", regex: /console\.log\s*\(\s*["']not implemented["']/i },
];

export async function detectStubs(filePath: string): Promise<StubDetectionResult> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return { hasStubs: false, stubs: [] };
  }

  const content = await file.text();
  const lines = content.split("\n");
  const stubs: StubInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const { pattern, regex } of STUB_PATTERNS) {
      if (regex.test(line)) {
        stubs.push({
          pattern,
          line: i + 1,
          content: line.trim(),
        });
      }
    }
  }

  return {
    hasStubs: stubs.length > 0,
    stubs,
  };
}

// ─── Must-Haves Verification ────────────────────────────────────

/**
 * Verify all must-haves for a task.
 * Checks: file existence, minimum substance, exports, import links, stubs.
 */
export async function verifyMustHaves(
  projectRoot: string,
  mustHaves: MustHaves
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];

  // Check each artifact
  for (const artifact of mustHaves.artifacts) {
    const absPath = `${projectRoot}/${artifact.path}`;

    // File existence
    const existsCheck = await verifyFileExists(absPath);
    checks.push(existsCheck);
    if (!existsCheck.passed) continue;

    // Minimum substance
    if (artifact.minLines > 0) {
      checks.push(await verifyMinimumSubstance(absPath, artifact.minLines));
    }

    // Required exports
    if (artifact.requiredExports.length > 0) {
      checks.push(await verifyExports(absPath, artifact.requiredExports));
    }

    // Stub detection
    const stubResult = await detectStubs(absPath);
    checks.push({
      name: `stub-free:${artifact.path}`,
      type: "static",
      passed: !stubResult.hasStubs,
      message: stubResult.hasStubs
        ? `Stubs detected in ${artifact.path}: ${stubResult.stubs.map((s) => `${s.pattern} (line ${s.line})`).join(", ")}`
        : `No stubs in ${artifact.path}`,
    });
  }

  // Check key links (parse "fileA imports symbol from module" format)
  for (const link of mustHaves.keyLinks) {
    const parsed = parseKeyLink(projectRoot, link);
    if (parsed) {
      checks.push(
        await verifyImportLink(parsed.sourceFile, parsed.symbol, parsed.fromModule)
      );
    }
  }

  return {
    passed: checks.length > 0 && checks.every((c) => c.passed),
    checks,
  };
}

// ─── Command-Tier Verification (GAP-10) ──────────────────────────

/**
 * Run tsc --noEmit and return a VerificationCheck.
 * Per spec §11.2: Command tier — "Tests pass, build succeeds, lint clean, types check."
 * GAP-10 fix: Previously only static checks were run; tsc/linter were left to the LLM.
 */
export async function runTypeCheck(projectRoot: string): Promise<VerificationCheck> {
  try {
    const result = await Bun.$`cd ${projectRoot} && bunx tsc --noEmit 2>&1`.quiet().text();
    return {
      name: "typecheck:tsc",
      type: "command",
      passed: true,
      message: "TypeScript type-check passed",
    };
  } catch (err) {
    const output = err instanceof Error && "stdout" in err
      ? String((err as { stdout: unknown }).stdout)
      : String(err);
    // Truncate output to avoid huge messages
    const truncated = output.length > 500 ? output.slice(0, 500) + "..." : output;
    return {
      name: "typecheck:tsc",
      type: "command",
      passed: false,
      message: `TypeScript errors: ${truncated}`,
    };
  }
}

/**
 * Run linter (biome or eslint) and return a VerificationCheck.
 */
export async function runLinter(projectRoot: string): Promise<VerificationCheck> {
  // Try biome first (preferred), fall back to eslint
  try {
    await Bun.$`cd ${projectRoot} && bunx biome check . 2>&1`.quiet().text();
    return {
      name: "lint:biome",
      type: "command",
      passed: true,
      message: "Linter check passed (biome)",
    };
  } catch (biomeErr) {
    // Check if biome is simply not installed vs actual lint errors
    const biomeOutput = biomeErr instanceof Error ? biomeErr.message : String(biomeErr);
    if (biomeOutput.includes("not found") || biomeOutput.includes("ENOENT")) {
      // Try eslint as fallback
      try {
        await Bun.$`cd ${projectRoot} && bunx eslint . 2>&1`.quiet().text();
        return {
          name: "lint:eslint",
          type: "command",
          passed: true,
          message: "Linter check passed (eslint)",
        };
      } catch (eslintErr) {
        const eslintOutput = eslintErr instanceof Error ? eslintErr.message : String(eslintErr);
        if (eslintOutput.includes("not found") || eslintOutput.includes("ENOENT")) {
          // No linter available — pass with note
          return {
            name: "lint:none",
            type: "command",
            passed: true,
            message: "No linter configured (biome/eslint not found) — skipped",
          };
        }
        const truncated = eslintOutput.length > 500 ? eslintOutput.slice(0, 500) + "..." : eslintOutput;
        return {
          name: "lint:eslint",
          type: "command",
          passed: false,
          message: `ESLint errors: ${truncated}`,
        };
      }
    }

    const truncated = biomeOutput.length > 500 ? biomeOutput.slice(0, 500) + "..." : biomeOutput;
    return {
      name: "lint:biome",
      type: "command",
      passed: false,
      message: `Biome errors: ${truncated}`,
    };
  }
}

/**
 * Run all command-tier verification checks.
 * Returns results for tsc and linter.
 */
export async function runCommandVerification(
  projectRoot: string
): Promise<VerificationCheck[]> {
  const [typeCheck, lint] = await Promise.all([
    runTypeCheck(projectRoot),
    runLinter(projectRoot),
  ]);
  return [typeCheck, lint];
}

// ─── Pre-flight Validation ──────────────────────────────────────

export interface AutoFix {
  type: "path-prefix";
  original: string;
  fixed: string;
  description: string;
}

export interface PreflightResult {
  ok: boolean;
  fixes: AutoFix[];
  blockers: string[];
}

/**
 * Run fast deterministic checks before Claude invocation.
 * Catches plan errors before spending tokens. Auto-fixes common path prefix issues.
 */
export async function preflight(
  projectRoot: string,
  state: import("./types.ts").ProjectState,
  taskPlan: import("./types.ts").TaskPlan
): Promise<PreflightResult> {
  const fixes: AutoFix[] = [];
  const blockers: string[] = [];

  const { currentMilestone: m, currentSlice: s, currentTask: t } = state;

  // 1. Check upstream task SUMMARYs exist (dependency check)
  if (m && s && t) {
    const { PATHS } = await import("./types.ts");
    const tasksDir = `${projectRoot}/${PATHS.slicePath(m, s)}/tasks`;
    const taskNum = parseInt(t.replace("T", ""), 10);

    for (let i = 1; i < taskNum; i++) {
      const upstreamId = `T${String(i).padStart(2, "0")}`;
      const summaryPath = `${tasksDir}/${upstreamId}/SUMMARY.md`;
      const exists = await Bun.file(summaryPath).exists();
      if (!exists) {
        // Not a blocker — upstream might be deferred. Just warn.
        blockers.push(`Upstream ${upstreamId} SUMMARY.md missing — task may depend on incomplete work`);
      }
    }
  }

  // 2. Check artifact parent directories exist
  for (const artifact of taskPlan.mustHaves.artifacts) {
    const absPath = `${projectRoot}/${artifact.path}`;
    const parentDir = absPath.substring(0, absPath.lastIndexOf("/"));
    const parentExists = await Bun.file(parentDir).exists().catch(() => false);

    if (!parentExists) {
      // Try auto-fix: prepend "playground/" if bare "src/" path
      if (artifact.path.startsWith("src/") && !artifact.path.startsWith("playground/")) {
        const playgroundPath = `playground/${artifact.path}`;
        const playgroundParent = `${projectRoot}/${playgroundPath}`.substring(0, `${projectRoot}/${playgroundPath}`.lastIndexOf("/"));
        const pgExists = await Bun.file(playgroundParent).exists().catch(() => false);
        if (pgExists) {
          fixes.push({
            type: "path-prefix",
            original: artifact.path,
            fixed: playgroundPath,
            description: `Auto-fixed path: ${artifact.path} → ${playgroundPath}`,
          });
          continue;
        }
      }
      // Parent dir doesn't exist — not necessarily a blocker (will be created)
    }
  }

  // 3. Check TDD sequence test paths consistency with artifacts
  for (const testFile of taskPlan.tddSequence.testFiles) {
    if (testFile.startsWith("src/") && !testFile.startsWith("playground/")) {
      // Check if playground prefix is needed
      const hasPlaygroundArtifact = taskPlan.mustHaves.artifacts.some(
        (a) => a.path.startsWith("playground/")
      );
      if (hasPlaygroundArtifact) {
        fixes.push({
          type: "path-prefix",
          original: testFile,
          fixed: `playground/${testFile}`,
          description: `Test path inconsistent with artifacts: ${testFile} → playground/${testFile}`,
        });
      }
    }
  }

  // 4. Check vault docs referenced in plan exist
  const vaultRefs = taskPlan.steps.join("\n").match(/\[\[([^\]]+)\]\]/g) ?? [];
  for (const ref of vaultRefs) {
    const docPath = ref.slice(2, -2);
    const fullPath = `${projectRoot}/.superclaude/vault/${docPath}.md`;
    const exists = await Bun.file(fullPath).exists();
    if (!exists) {
      blockers.push(`Referenced vault doc not found: [[${docPath}]]`);
    }
  }

  return {
    ok: blockers.length === 0,
    fixes,
    blockers,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

interface ParsedKeyLink {
  sourceFile: string;
  symbol: string;
  fromModule: string;
}

/**
 * Parse a key link string like "src/route.ts imports generateToken from ./auth"
 * Returns structured data or null if unparseable.
 */
function parseKeyLink(projectRoot: string, link: string): ParsedKeyLink | null {
  const match = link.match(/^(\S+)\s+imports?\s+(\S+)\s+from\s+(\S+)$/i);
  if (!match?.[1] || !match[2] || !match[3]) return null;

  return {
    sourceFile: `${projectRoot}/${match[1]}`,
    symbol: match[2],
    fromModule: match[3],
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
