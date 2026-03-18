import { fileURLToPath } from "node:url";

import { fileExists, readText, writeTextAtomic } from "./fs.js";
import { findPackageRoot, isPlaceholderContent, resolveRepoPath, ROOT_TEMPLATE_FILES } from "./paths.js";
import type { TemplateSyncResult } from "./types.js";

const packageRoot = findPackageRoot(fileURLToPath(import.meta.url));

export function syncManagedTemplates(targetRoot: string): TemplateSyncResult {
  const result: TemplateSyncResult = {
    created: [],
    replaced: [],
    kept: [],
  };

  for (const relativePath of ROOT_TEMPLATE_FILES) {
    const sourcePath = resolveRepoPath(packageRoot, relativePath);
    const targetPath = resolveRepoPath(targetRoot, relativePath);
    const sourceContent = readText(sourcePath);

    if (!fileExists(targetPath)) {
      writeTextAtomic(targetPath, sourceContent);
      result.created.push(relativePath);
      continue;
    }

    const existingContent = readText(targetPath);
    if (isPlaceholderContent(relativePath, existingContent) && existingContent !== sourceContent) {
      writeTextAtomic(targetPath, sourceContent);
      result.replaced.push(relativePath);
      continue;
    }

    result.kept.push(relativePath);
  }

  return result;
}

export function findPlaceholderFiles(targetRoot: string): string[] {
  return ROOT_TEMPLATE_FILES.filter((relativePath) => {
    const targetPath = resolveRepoPath(targetRoot, relativePath);
    if (!fileExists(targetPath)) {
      return relativePath.startsWith("vault/");
    }

    return isPlaceholderContent(relativePath, readText(targetPath));
  });
}
