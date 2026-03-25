import type { Database } from "bun:sqlite";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { getDb } from "./src/db";
import { loadSession, type TaktConfig } from "./cli-auth";

export interface FormatOptions {
  json?: boolean;
  quiet?: boolean;
  fullIds?: boolean;
  yes?: boolean;
}

export interface CommandContext {
  db: Database;
  dbPath: string;
  session: TaktConfig;
}

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const DEFAULT_PROJECT_ROOT = resolve(import.meta.dir, "..");
const STRIP_ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export const NOT_LOGGED_IN_MESSAGE = "Not logged in. Run `takt auth login` first.";
export const NO_DB_MESSAGE =
  "No database found. Run `takt serve` from the project directory or `takt auth login` to set a DB path.";

function colorsEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && process.env["NO_COLOR"] === undefined;
}

function colorize(text: string, color: string): string {
  if (!colorsEnabled()) {
    return text;
  }

  return `${color}${text}${ANSI.reset}`;
}

export function successText(text: string): string {
  return colorize(text, ANSI.green);
}

export function errorText(text: string): string {
  return colorize(text, ANSI.red);
}

export function warningText(text: string): string {
  return colorize(text, ANSI.yellow);
}

export function idText(text: string): string {
  return colorize(text, ANSI.cyan);
}

export function printSuccess(text: string): void {
  console.log(successText(text));
}

export function printWarning(text: string): void {
  console.log(warningText(text));
}

export function printError(text: string): void {
  console.error(errorText(text));
}

export function exitWithError(text: string, code = 1): never {
  printError(text);
  process.exit(code);
}

export function formatId(id: string, options: Pick<FormatOptions, "fullIds">): string {
  if (options.fullIds) {
    return id;
  }

  return `${id.slice(0, 8)}...`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.replace("T", " ").slice(0, 16);
}

function visibleLength(value: string): number {
  return value.replace(STRIP_ANSI_REGEX, "").length;
}

function padCell(value: string, width: number): string {
  const padding = width - visibleLength(value);
  if (padding <= 0) {
    return value;
  }

  return `${value}${" ".repeat(padding)}`;
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, columnIndex) =>
    Math.max(
      visibleLength(header),
      ...rows.map((row) => visibleLength(row[columnIndex] ?? ""))
    )
  );

  console.log(headers.map((header, columnIndex) => padCell(header, widths[columnIndex] ?? 0)).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));

  rows.forEach((row) => {
    console.log(row.map((cell, columnIndex) => padCell(cell, widths[columnIndex] ?? 0)).join("  "));
  });
}

export function parseGlobalOptions(args: string[]): FormatOptions {
  return {
    json: args.includes("--json"),
    quiet: args.includes("--quiet"),
    fullIds: args.includes("--full-ids"),
    yes: args.includes("--yes") || args.includes("-y"),
  };
}

export function readOptionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

export function getPositionals(args: string[], optionNamesWithValues: string[] = []): string[] {
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (
      arg === "--json" ||
      arg === "--quiet" ||
      arg === "--full-ids" ||
      arg === "--yes" ||
      arg === "-y"
    ) {
      continue;
    }

    if (optionNamesWithValues.includes(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      continue;
    }

    positionals.push(arg);
  }

  return positionals;
}

export function parseInteger(value: string | undefined, label: string): number {
  if (!value) {
    exitWithError(`${label} is required`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    exitWithError(`${label} must be an integer`);
  }

  return parsed;
}

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getProjectRoot(projectRoot = DEFAULT_PROJECT_ROOT): string {
  return projectRoot;
}

export function isProjectInvocation(
  cwd = process.cwd(),
  projectRoot = DEFAULT_PROJECT_ROOT
): boolean {
  const resolvedCwd = resolve(cwd);
  const resolvedRoot = resolve(projectRoot);
  return resolvedCwd === resolvedRoot || resolvedCwd.startsWith(`${resolvedRoot}/`);
}

export function getLocalDbPath(projectRoot = DEFAULT_PROJECT_ROOT): string {
  return resolve(projectRoot, "data/kanban.db");
}

export function resolveDbPath(
  session: TaktConfig | null,
  cwd = process.cwd(),
  projectRoot = DEFAULT_PROJECT_ROOT
): string | null {
  if (isProjectInvocation(cwd, projectRoot)) {
    return getLocalDbPath(projectRoot);
  }

  return session?.dbPath ?? null;
}

export async function getRequiredSession(): Promise<TaktConfig> {
  const session = await loadSession();
  if (!session) {
    exitWithError(NOT_LOGGED_IN_MESSAGE);
  }

  return session;
}

export async function getCommandContext(): Promise<CommandContext> {
  const session = await getRequiredSession();
  const dbPath = resolveDbPath(session);

  if (!dbPath) {
    exitWithError(NO_DB_MESSAGE);
  }

  return {
    db: getDb(dbPath),
    dbPath,
    session,
  };
}

export async function confirmOrExit(
  options: Pick<FormatOptions, "yes">,
  promptText: string,
  fallbackLines: string[] = []
): Promise<void> {
  if (options.yes) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fallbackLines.forEach((line) => console.log(line));
    if (fallbackLines.length > 0) {
      console.log("");
    }
    console.log("To confirm, run with --yes flag");
    process.exit(0);
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await readline.question(`${warningText(promptText)} [y/N] `);
  readline.close();

  if (answer.trim().toLowerCase() !== "y") {
    printWarning("Cancelled");
    process.exit(0);
  }
}
