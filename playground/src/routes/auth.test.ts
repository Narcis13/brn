import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { authRoutes } from "./auth";
import { getDb, runMigrations } from "../db";
import { rmSync } from "node:fs";

const TEST_DB_PATH = "/tmp/test-auth.db";

const app = new Hono();
app.route("/api/auth", authRoutes);

beforeEach(() => {
  // Set test environment variables
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.JWT_SECRET = "test-secret-key";
  
  // Initialize test database
  const db = getDb(TEST_DB_PATH);
  runMigrations(db);
  db.close();
});

afterEach(() => {
  // Clean up test database
  try {
    rmSync(TEST_DB_PATH, { force: true });
  } catch {}
  
  // Clean up environment variables
  delete process.env.DB_PATH;
  delete process.env.JWT_SECRET;
});

describe("POST /api/auth/signup", () => {
  test("with valid email/password returns 201 and a JWT token", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  test("with missing email returns 400", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "password123"
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with missing password returns 400", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com"
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with invalid email format returns 400", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: "password123"
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with short password (< 8 chars) returns 400", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "short"
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with duplicate email returns 409", async () => {
    // First signup
    await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });

    // Second signup with same email
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password456"
      })
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    // Create a test user
    await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });
  });

  test("with valid credentials returns 200 and a JWT token", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  test("with wrong password returns 401", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrongpassword"
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with non-existent email returns 401", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent@example.com",
        password: "password123"
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("with missing fields returns 400", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("Returned token", () => {
  test("is a valid JWT containing userId and email", async () => {
    const res = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123"
      })
    });

    const body = await res.json();
    const decoded = jwt.decode(body.token) as JwtPayload;
    
    expect(decoded).toBeTruthy();
    expect(decoded.userId).toBeTruthy();
    expect(decoded.email).toBe("test@example.com");
  });
});