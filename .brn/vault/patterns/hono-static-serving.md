---
title: Serve static files from Bun.serve fetch handler, not Hono middleware
type: pattern
confidence: verified
source: manual (pre-BRN debugging session)
created: 2026-03-22
---

## Approach
When building a Hono app that also serves static files (SPA with API):
route API calls through Hono, handle static files directly in `Bun.serve`'s
fetch handler.

```typescript
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes go through Hono
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      return app.fetch(req);
    }

    // Static files served directly
    const filePath = `public${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);

    // SPA fallback
    return new Response(Bun.file("public/index.html"));
  },
});
```

## Why not Hono's serveStatic
`hono/bun`'s `serveStatic` middleware with a `*` catch-all route can
interfere with test suites. The module-level import and route registration
happens even during `bun test`, causing unexpected routing conflicts.

## When to use
Any Bun + Hono project that serves both an API and a static frontend.
