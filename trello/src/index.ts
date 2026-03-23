import { getDb } from "./db.ts";
import { createApp } from "./routes.ts";

const PORT = Number(process.env["PORT"] ?? 3001);
const PUBLIC_DIR = import.meta.dir + "/../public";

const db = getDb();
const app = createApp(db);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes go through Hono
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(req);
    }

    // Static files
    const filePath = `${PUBLIC_DIR}${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);

    // SPA fallback
    return new Response(Bun.file(`${PUBLIC_DIR}/index.html`));
  },
});

console.log(`Mini Trello running at http://localhost:${server.port}`);
