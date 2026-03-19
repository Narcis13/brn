import { Hono } from "hono";
import { getDb, runMigrations } from "./db.ts";

// Initialize Hono application
export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Server configuration
const port = Number(Bun.env.PORT ?? 3000);
const dbPath = Bun.env.DB_PATH ?? "./data/app.db";

// Initialize database and run migrations
const db = getDb(dbPath);
runMigrations(db);

// Export server configuration for Bun.serve
export default {
  port,
  fetch: app.fetch,
};
