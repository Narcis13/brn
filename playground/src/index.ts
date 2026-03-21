import { Hono } from "hono";
import { getDb, runMigrations } from "./db.ts";
import { authRoutes } from "./routes/auth";
import { boardRoutes } from "./routes/boards";
import { cardRoutes } from "./routes/cards";

// Initialize Hono application
export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount auth routes
app.route("/api/auth", authRoutes);

// Mount board routes
app.route("/api/boards", boardRoutes);

// Mount card routes
app.route("/api/cards", cardRoutes);

// Server start function that actually starts the server
export async function startServer(): Promise<void> {
  // Server configuration
  const port = Number(Bun.env.PORT ?? 3000);
  const dbPath = Bun.env.DB_PATH ?? "./data/app.db";

  // Initialize database - only when actually starting
  const db = getDb(dbPath);
  // Run migrations synchronously to ensure DB is ready
  runMigrations(db);

  // Start the server only if not in test environment
  if (!import.meta.env?.TEST && !process.env.BUN_TEST) {
    console.log(`Starting server on port ${port}...`);
    const server = Bun.serve({
      port,
      fetch: app.fetch,
    });
    console.log(`Server running at http://localhost:${server.port}`);
  }
}

// Only start the server if this file is run directly
if (import.meta.main) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

