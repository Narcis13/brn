import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function readJsonFile<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function writeTextAtomic(path: string, content: string): void {
  ensureDirectory(dirname(path));
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

export function writeJsonFile(path: string, value: unknown): void {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function appendJsonLine(path: string, value: unknown): void {
  ensureDirectory(dirname(path));
  appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

export function readJsonLines<T>(path: string): T[] {
  const content = readTextIfExists(path);
  if (!content) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function listFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  return readdirSync(path).sort();
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

export function joinPath(...parts: string[]): string {
  return join(...parts);
}
