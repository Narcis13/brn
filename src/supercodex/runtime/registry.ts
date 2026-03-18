import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

import { readJsonFile, writeJsonFile } from "../fs.js";
import { resolveRepoPath } from "../paths.js";
import { validateDispatchPacket, validateRuntimeProbeResult, validateRuntimeRegistry } from "./schemas.js";
import { runCommand } from "./process.js";
import type { DispatchPacket, RuntimeCapability, RuntimeId, RuntimeProbeResult, RuntimeRegistry } from "./types.js";

export const RUNTIME_REGISTRY_PATH = ".supercodex/runtime/adapters.json";
export const DISPATCH_TEMPLATE_PATH = ".supercodex/prompts/dispatch.json";
export const RUNTIME_TEMP_DIR = ".supercodex/temp/runtime";

export function loadRuntimeRegistry(root: string): RuntimeRegistry {
  const registry = readJsonFile<RuntimeRegistry>(resolveRepoPath(root, RUNTIME_REGISTRY_PATH));
  validateRuntimeRegistry(registry);
  return registry;
}

export function saveRuntimeRegistry(root: string, registry: RuntimeRegistry): void {
  validateRuntimeRegistry(registry);
  writeJsonFile(resolveRepoPath(root, RUNTIME_REGISTRY_PATH), registry);
}

export function loadDispatchTemplate(root: string): DispatchPacket {
  const packet = readJsonFile<DispatchPacket>(resolveRepoPath(root, DISPATCH_TEMPLATE_PATH));
  validateDispatchPacket(packet);
  return packet;
}

export function loadDispatchPacket(packetPath: string): DispatchPacket {
  const packet = readJsonFile<DispatchPacket>(packetPath);
  validateDispatchPacket(packet);
  return packet;
}

export function saveDispatchTemplate(root: string, packet: DispatchPacket): void {
  validateDispatchPacket(packet);
  writeJsonFile(resolveRepoPath(root, DISPATCH_TEMPLATE_PATH), packet);
}

export function listRuntimeRegistry(root: string): RuntimeRegistry {
  return loadRuntimeRegistry(root);
}

export function runtimeSupports(registry: RuntimeRegistry, runtime: RuntimeId, capability: RuntimeCapability): boolean {
  return registry.runtimes[runtime].capabilities.includes(capability);
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(command: string, envPath = process.env.PATH ?? ""): string | null {
  if (command.includes("/")) {
    return isExecutable(command) ? command : null;
  }

  for (const segment of envPath.split(delimiter).filter(Boolean)) {
    const candidate = join(segment, command);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function probeRuntimeId(root: string, registry: RuntimeRegistry, runtime: RuntimeId): Promise<RuntimeProbeResult> {
  const entry = registry.runtimes[runtime];
  const checked_at = new Date().toISOString();
  const resolved = resolveExecutable(entry.command);

  if (!resolved) {
    const missing: RuntimeProbeResult = {
      runtime,
      display_name: entry.display_name,
      command: entry.command,
      enabled: entry.enabled,
      configured: entry.configured,
      capabilities: [...entry.capabilities],
      available: false,
      path: null,
      version: null,
      checked_at,
      error: "Executable was not found on PATH.",
    };
    validateRuntimeProbeResult(missing);
    return missing;
  }

  try {
    const version = await runCommand({
      command: resolved,
      args: ["--version"],
      cwd: root,
    });

    const probe: RuntimeProbeResult = {
      runtime,
      display_name: entry.display_name,
      command: entry.command,
      enabled: entry.enabled,
      configured: entry.configured,
      capabilities: [...entry.capabilities],
      available: true,
      path: resolved,
      version: (version.stdout || version.stderr).trim() || null,
      checked_at,
      error: version.exit_code === 0 ? null : (version.stderr.trim() || `Version command exited ${version.exit_code}`),
    };
    validateRuntimeProbeResult(probe);
    return probe;
  } catch (error) {
    const probe: RuntimeProbeResult = {
      runtime,
      display_name: entry.display_name,
      command: entry.command,
      enabled: entry.enabled,
      configured: entry.configured,
      capabilities: [...entry.capabilities],
      available: true,
      path: resolved,
      version: null,
      checked_at,
      error: error instanceof Error ? error.message : String(error),
    };
    validateRuntimeProbeResult(probe);
    return probe;
  }
}

export async function probeRuntimes(root: string, runtime?: RuntimeId): Promise<RuntimeProbeResult[]> {
  const registry = loadRuntimeRegistry(root);
  const runtimes = runtime ? [runtime] : (Object.keys(registry.runtimes) as RuntimeId[]);
  const probes = await Promise.all(runtimes.map((runtimeId) => probeRuntimeId(root, registry, runtimeId)));

  const nextRegistry: RuntimeRegistry = {
    ...registry,
    runtimes: {
      ...registry.runtimes,
    },
  };

  for (const probe of probes) {
    nextRegistry.runtimes[probe.runtime] = {
      ...nextRegistry.runtimes[probe.runtime],
      last_probe: {
        available: probe.available,
        path: probe.path,
        version: probe.version,
        checked_at: probe.checked_at,
        error: probe.error,
      },
    };
  }

  saveRuntimeRegistry(root, nextRegistry);
  return probes;
}

export function resolvePacketPath(root: string, packetPath: string): string {
  return isAbsolute(packetPath) ? packetPath : resolveRepoPath(root, packetPath);
}
