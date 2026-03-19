import { Hono } from "hono";
import { getDb, runMigrations } from "./db.ts";
import type { Serve } from "bun";

// Initialize Hono application
export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Server start function with proper initialization
export async function startServer(): Promise<void> {
  // Server configuration
  const port = Number(Bun.env.PORT ?? 3000);
  const dbPath = Bun.env.DB_PATH ?? "./data/app.db";

  // Initialize database and run migrations
  const db = getDb(dbPath);
  await Promise.resolve(runMigrations(db));

  // Start the server only if not in test environment
  if (!import.meta.env?.TEST && !process.env.BUN_TEST) {
    console.log(`Starting server on port ${port}...`);
    Bun.serve({
      port,
      fetch: app.fetch,
    });
  }
}

// Only start the server if this file is run directly
if (import.meta.main) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

// Export server configuration for testing
export default {
  port: Number(Bun.env.PORT ?? 3000),
  fetch: app.fetch,
} satisfies Partial<Serve>;