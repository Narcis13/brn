import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createUser, getUserByUsername, type UserRow } from "./src/db";

const CONFIG_DIR = join(homedir(), ".takt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface TaktConfig {
  userId: string;
  username: string;
  dbPath: string;
}

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export async function saveSession(userId: string, username: string, dbPath: string): Promise<void> {
  ensureConfigDir();
  const config: TaktConfig = { userId, username, dbPath };
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function loadSession(): Promise<TaktConfig | null> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (!(await file.exists())) return null;
    const config = await file.json();
    // Check if it's a valid session (not empty object)
    if (!config.userId || !config.username || !config.dbPath) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      await Bun.write(CONFIG_FILE, "{}");
    }
  } catch {
    // Ignore errors
  }
}

export async function register(db: Database, username: string, password: string): Promise<UserRow> {
  const passwordHash = await Bun.password.hash(password);
  return createUser(db, username, passwordHash);
}

export async function login(db: Database, username: string, password: string): Promise<UserRow | null> {
  const user = getUserByUsername(db, username);
  if (!user) return null;
  
  const valid = await Bun.password.verify(password, user.password_hash);
  if (!valid) return null;
  
  return user;
}