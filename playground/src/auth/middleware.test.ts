import { describe, expect, test, beforeEach } from "bun:test";
import { Hono } from "hono";
import { authMiddleware, getAuthContext } from "./middleware";
import { generateToken } from "./jwt";
import type { AuthContext } from "../types";

describe("authMiddleware", () => {
  let app: Hono;

  beforeEach(() => {
    // Reset JWT_SECRET for tests
    process.env.JWT_SECRET = "test-secret-key-for-testing-only";
    
    app = new Hono();
    app.use("/protected/*", authMiddleware);
    
    // Test endpoint to verify auth context
    app.get("/protected/test", (c) => {
      const authContext = getAuthContext(c);
      if (!authContext) {
        return c.json({ error: "No auth context" }, 500);
      }
      return c.json(authContext);
    });
  });

  test("request with valid Authorization header passes through with authContext set", async () => {
    const token = generateToken({ userId: "user-123", email: "test@example.com" });
    
    const res = await app.request("/protected/test", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      userId: "user-123",
      email: "test@example.com"
    });
  });

  test("request without Authorization header returns 401", async () => {
    const res = await app.request("/protected/test");
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  test("request with malformed Authorization header returns 401", async () => {
    const res = await app.request("/protected/test", {
      headers: {
        "Authorization": "NotBearer token"
      }
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  test("request with expired token returns 401", async () => {
    // Generate a token with 3 second expiration
    const token = generateToken({ userId: "user-123", email: "test@example.com" }, "3s");
    
    // Wait for it to expire (give extra buffer for test reliability)
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    const res = await app.request("/protected/test", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  test("request with invalid token returns 401", async () => {
    const res = await app.request("/protected/test", {
      headers: {
        "Authorization": "Bearer invalid-jwt-token"
      }
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  test("authContext contains userId and email extracted from token", async () => {
    const token = generateToken({ userId: "user-456", email: "another@example.com" });
    
    app.get("/protected/context-test", (c) => {
      const authContext = getAuthContext(c);
      return c.json({ authContext });
    });
    
    const res = await app.request("/protected/context-test", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authContext).toEqual({
      userId: "user-456",
      email: "another@example.com"
    });
  });

  test("GET /api/auth/me returns current user info when authenticated", async () => {
    // Create app with auth routes
    const authApp = new Hono();
    
    // Import and mount auth routes (we'll update this file next)
    const { authRoutes } = await import("../routes/auth");
    authApp.route("/api/auth", authRoutes);
    
    const token = generateToken({ userId: "user-789", email: "me@example.com" });
    
    const res = await authApp.request("/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      userId: "user-789",
      email: "me@example.com"
    });
  });
});