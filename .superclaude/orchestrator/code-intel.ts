/**
 * SUPER_CLAUDE — Code Intelligence (Deterministic)
 * Extracts exports, imports, and signatures from TypeScript files.
 * No LLM needed — pure regex-based static analysis.
 */

// ─── Types ───────────────────────────────────────────────────

export interface ExportInfo {
  name: string;
  kind: "function" | "async function" | "const" | "type" | "interface" | "class" | "enum";
  signature: string;
}

export interface FileIntel {
  path: string;
  exports: ExportInfo[];
  imports: string[];
  lineCount: number;
}

export interface TaskIntel {
  task: string;
  goal: string;
  artifacts: FileIntel[];
  testFiles: TestFileInfo[];
}

export interface TestFileInfo {
  path: string;
  testCount: number;
}

export interface SliceContract {
  slice: string;
  milestone: string;
  demoSentence: string;
  produces: FileIntel[];
  tables: TableInfo[];
}

export interface TableInfo {
  name: string;
  columns: string[];
}

// ─── Export Extraction ───────────────────────────────────────

/**
 * Extract exported symbols and their signatures from a TypeScript file.
 */
export function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // export async function name(params): ReturnType
  const asyncFnPattern = /^export\s+async\s+function\s+(\w+)\s*(\([^)]*\))\s*(?::\s*([^\s{]+(?:<[^>]+>)?))?/gm;
  let match: RegExpExecArray | null;
  while ((match = asyncFnPattern.exec(content)) !== null) {
    const name = match[1]!;
    const params = match[2]!;
    const returnType = match[3] ?? "Promise<unknown>";
    exports.push({
      name,
      kind: "async function",
      signature: `${name}${params}: ${returnType}`,
    });
  }

  // export function name(params): ReturnType
  const fnPattern = /^export\s+function\s+(\w+)\s*(\([^)]*\))\s*(?::\s*([^\s{]+(?:<[^>]+>)?))?/gm;
  while ((match = fnPattern.exec(content)) !== null) {
    const name = match[1]!;
    // Skip if already captured as async
    if (exports.some(e => e.name === name)) continue;
    const params = match[2]!;
    const returnType = match[3] ?? "unknown";
    exports.push({
      name,
      kind: "function",
      signature: `${name}${params}: ${returnType}`,
    });
  }

  // export const name = ...  or  export const name: Type = ...
  const constPattern = /^export\s+const\s+(\w+)\s*(?::\s*([^\s=]+(?:<[^>]+>)?))?\s*=/gm;
  while ((match = constPattern.exec(content)) !== null) {
    const name = match[1]!;
    const type = match[2] ?? "unknown";
    exports.push({
      name,
      kind: "const",
      signature: `${name}: ${type}`,
    });
  }

  // export interface Name { ... }
  const ifacePattern = /^export\s+interface\s+(\w+(?:<[^>]+>)?)/gm;
  while ((match = ifacePattern.exec(content)) !== null) {
    exports.push({
      name: match[1]!,
      kind: "interface",
      signature: match[1]!,
    });
  }

  // export type Name = ...
  const typePattern = /^export\s+type\s+(\w+(?:<[^>]+>)?)/gm;
  while ((match = typePattern.exec(content)) !== null) {
    exports.push({
      name: match[1]!,
      kind: "type",
      signature: match[1]!,
    });
  }

  // export class Name
  const classPattern = /^export\s+class\s+(\w+)/gm;
  while ((match = classPattern.exec(content)) !== null) {
    exports.push({
      name: match[1]!,
      kind: "class",
      signature: match[1]!,
    });
  }

  // export enum Name
  const enumPattern = /^export\s+enum\s+(\w+)/gm;
  while ((match = enumPattern.exec(content)) !== null) {
    exports.push({
      name: match[1]!,
      kind: "enum",
      signature: match[1]!,
    });
  }

  return exports;
}

/**
 * Extract import statements from a TypeScript file.
 * Returns human-readable import descriptions like "hashPassword from ./auth/password"
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importPattern = /^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/gm;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(content)) !== null) {
    const named = match[1]?.trim();
    const defaultImport = match[2];
    const from = match[3]!;

    // Skip node_modules / bun built-ins
    if (!from.startsWith(".") && !from.startsWith("/")) continue;

    if (named) {
      const names = named.split(",").map(n => n.trim()).filter(Boolean);
      imports.push(`${names.join(", ")} from ${from}`);
    } else if (defaultImport) {
      imports.push(`${defaultImport} from ${from}`);
    }
  }

  return imports;
}

/**
 * Extract full intelligence from a single TypeScript file.
 */
export async function analyzeFile(projectRoot: string, relativePath: string): Promise<FileIntel | null> {
  const absPath = `${projectRoot}/${relativePath}`;
  const file = Bun.file(absPath);
  if (!(await file.exists())) return null;

  const content = await file.text();
  return {
    path: relativePath,
    exports: extractExports(content),
    imports: extractImports(content),
    lineCount: content.split("\n").length,
  };
}

/**
 * Count tests in a test file by running bun test --dry-run or parsing test() calls.
 */
export function countTests(content: string): number {
  const testPattern = /\btest\s*\(/g;
  const itPattern = /\bit\s*\(/g;
  let count = 0;
  while (testPattern.exec(content)) count++;
  while (itPattern.exec(content)) count++;
  return count;
}

/**
 * Extract table definitions from SQL migration statements.
 */
export function extractTables(content: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const createPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = createPattern.exec(content)) !== null) {
    const name = match[1]!;
    const body = match[2]!;
    const columns = body
      .split(",")
      .map(col => col.trim().split(/\s+/)[0])
      .filter((col): col is string => !!col && !col.startsWith("PRIMARY") && !col.startsWith("UNIQUE") && !col.startsWith("FOREIGN") && !col.startsWith("CHECK") && !col.startsWith("CONSTRAINT"));
    tables.push({ name, columns });
  }

  return tables;
}

// ─── Task-Level Intelligence ─────────────────────────────────

/**
 * Build full intelligence for a completed task by reading its plan and artifacts.
 */
export async function buildTaskIntel(
  projectRoot: string,
  milestone: string,
  slice: string,
  task: string
): Promise<TaskIntel | null> {
  const { PATHS } = await import("./types.ts");
  const { parseTaskPlan } = await import("./plan-parser.ts");

  const planPath = `${projectRoot}/${PATHS.taskPath(milestone, slice, task)}/PLAN.md`;
  const planFile = Bun.file(planPath);
  if (!(await planFile.exists())) return null;

  const planContent = await planFile.text();
  const taskPlan = parseTaskPlan(planContent);
  if (!taskPlan) return null;

  // Analyze implementation files
  const artifacts: FileIntel[] = [];
  for (const artifact of taskPlan.mustHaves.artifacts) {
    const intel = await analyzeFile(projectRoot, artifact.path);
    if (intel) artifacts.push(intel);
  }

  // Also analyze any implementation files from TDD sequence not in artifacts
  for (const implPath of taskPlan.tddSequence.implementationFiles) {
    if (!artifacts.some(a => a.path === implPath)) {
      const intel = await analyzeFile(projectRoot, implPath);
      if (intel) artifacts.push(intel);
    }
  }

  // Analyze test files
  const testFiles: TestFileInfo[] = [];
  for (const testPath of taskPlan.tddSequence.testFiles) {
    const absPath = `${projectRoot}/${testPath}`;
    const file = Bun.file(absPath);
    if (await file.exists()) {
      const content = await file.text();
      testFiles.push({
        path: testPath,
        testCount: countTests(content),
      });
    }
  }

  return {
    task,
    goal: taskPlan.goal,
    artifacts,
    testFiles,
  };
}

// ─── Slice-Level Contract Generation ─────────────────────────

/**
 * Build a boundary contract for a completed slice by scanning all task artifacts.
 */
export async function buildSliceContract(
  projectRoot: string,
  milestone: string,
  slice: string
): Promise<SliceContract | null> {
  const { PATHS } = await import("./types.ts");

  // Read demo sentence from slice PLAN.md
  const slicePlanPath = `${projectRoot}/${PATHS.slicePath(milestone, slice)}/PLAN.md`;
  const slicePlanFile = Bun.file(slicePlanPath);
  let demoSentence = "";
  if (await slicePlanFile.exists()) {
    const content = await slicePlanFile.text();
    const match = content.match(/demo_sentence:\s*"?([^"\n]+)"?/i);
    demoSentence = match?.[1]?.trim() ?? "";
  }

  // Discover all tasks
  const tasksDir = `${projectRoot}/${PATHS.slicePath(milestone, slice)}/tasks`;
  const allProduces: FileIntel[] = [];
  const allTables: TableInfo[] = [];
  const seenPaths = new Set<string>();

  try {
    const glob = new Bun.Glob("T*/PLAN.md");
    for await (const path of glob.scan({ cwd: tasksDir })) {
      const taskId = path.split("/")[0]!;
      const intel = await buildTaskIntel(projectRoot, milestone, slice, taskId);
      if (!intel) continue;

      for (const artifact of intel.artifacts) {
        if (!seenPaths.has(artifact.path)) {
          seenPaths.add(artifact.path);
          allProduces.push(artifact);
        }
      }
    }
  } catch {
    // No tasks directory
  }

  // Scan for SQL migrations in implementation files
  for (const fileIntel of allProduces) {
    const absPath = `${projectRoot}/${fileIntel.path}`;
    const file = Bun.file(absPath);
    if (await file.exists()) {
      const content = await file.text();
      const tables = extractTables(content);
      for (const table of tables) {
        if (!allTables.some(t => t.name === table.name)) {
          allTables.push(table);
        }
      }
    }
  }

  return {
    slice,
    milestone,
    demoSentence,
    produces: allProduces,
    tables: allTables,
  };
}

// ─── Markdown Rendering ──────────────────────────────────────

/**
 * Render a TaskIntel into enriched summary markdown.
 */
export function renderTaskIntelSummary(intel: TaskIntel): string {
  let md = `## What Was Built\n${intel.goal}\n`;

  if (intel.artifacts.length > 0) {
    md += `\n## Artifacts\n`;
    for (const artifact of intel.artifacts) {
      md += `- \`${artifact.path}\` (${artifact.lineCount} lines)\n`;
      for (const exp of artifact.exports) {
        md += `  - ${exp.kind} **${exp.signature}**\n`;
      }
      if (artifact.imports.length > 0) {
        md += `  - imports: ${artifact.imports.join("; ")}\n`;
      }
    }
  }

  if (intel.testFiles.length > 0) {
    const totalTests = intel.testFiles.reduce((sum, t) => sum + t.testCount, 0);
    md += `\n## Test Coverage\n`;
    for (const tf of intel.testFiles) {
      md += `- \`${tf.path}\` — ${tf.testCount} tests\n`;
    }
    md += `- **Total: ${totalTests} tests**\n`;
  }

  return md;
}

/**
 * Render a SliceContract into vault-ready markdown.
 */
export function renderSliceContract(contract: SliceContract): string {
  let md = `---
title: "${contract.slice} Boundary Contract"
type: contract
slice: ${contract.slice}
milestone: ${contract.milestone}
generated: ${new Date().toISOString()}
---

# ${contract.slice}: ${contract.demoSentence || contract.slice}

## Produces

| File | Export | Kind | Signature |
|---|---|---|---|\n`;

  for (const file of contract.produces) {
    for (const exp of file.exports) {
      md += `| \`${file.path}\` | ${exp.name} | ${exp.kind} | \`${exp.signature}\` |\n`;
    }
  }

  if (contract.tables.length > 0) {
    md += `\n## Database Tables\n\n| Table | Columns |\n|---|---|\n`;
    for (const table of contract.tables) {
      md += `| ${table.name} | ${table.columns.join(", ")} |\n`;
    }
  }

  return md;
}
