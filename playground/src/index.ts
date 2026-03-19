import { Hono } from "hono";
import { getDb, runMigrations } from "./db.ts";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

export { app };

// Start server when run directly
const port = Number(Bun.env["PORT"] ?? 3000);
const dbPath = Bun.env["DB_PATH"] ?? "./data/app.db";

const db = getDb(dbPath);
runMigrations(db);

export default {
  port,
  fetch: app.fetch,
};
