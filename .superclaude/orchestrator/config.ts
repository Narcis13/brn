/**
 * SUPER_CLAUDE — Configuration
 * Parse CLI args and load config.
 */

import { DEFAULT_CONFIG, type OrchestratorConfig } from "./types.ts";

export function parseArgs(args: string[]): OrchestratorConfig {
  const config: OrchestratorConfig = { ...DEFAULT_CONFIG };

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.slice(7);
      if (mode === "auto" || mode === "step" || mode === "interactive") {
        config.mode = mode;
      }
    } else if (arg.startsWith("--budget=")) {
      config.budgetCeiling = parseFloat(arg.slice(9));
    } else if (arg.startsWith("--milestone=")) {
      config.milestone = arg.slice(12);
    }
  }

  return config;
}

export function getProjectRoot(): string {
  return process.cwd();
}
