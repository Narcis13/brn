import { getDb } from "./db.ts";
import { createApp } from "./routes.ts";

const PORT = Number(process.env["PORT"] ?? 3000);
const db = getDb();
const app = createApp(db);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes go through Hono
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(req);
    }

    // Static files served directly
    const filePath = `playground/public${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);

    // SPA fallback
    return new Response(Bun.file("playground/public/index.html"));
  },
});

console.log(`Bookmark Vault running at http://localhost:${PORT}`);
