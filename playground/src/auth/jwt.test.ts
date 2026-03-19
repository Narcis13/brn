import { describe, test, expect, beforeAll } from "bun:test";
import { generateToken, verifyToken, type TokenPayload } from "./jwt";

describe("JWT utilities", () => {
  beforeAll(() => {
    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = "test-secret-key-for-testing";
  });

  test("generateToken returns a non-empty string", () => {
    const token = generateToken({ userId: "123", email: "test@example.com" });
    
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("verifyToken returns the payload for a valid token", () => {
    const payload: TokenPayload = { userId: "123", email: "test@example.com" };
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    
    expect(decoded).toBeDefined();
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.email).toBe(payload.email);
  });

  test("verifyToken throws/returns null for an invalid token", () => {
    const invalidToken = "invalid.token.here";
    const decoded = verifyToken(invalidToken);
    
    expect(decoded).toBeNull();
  });

  test("verifyToken throws/returns null for an expired token", async () => {
    // Create a token that's already expired
    const secret = process.env.JWT_SECRET!;
    const expiredPayload = {
      userId: "123",
      email: "test@example.com",
      iat: Math.floor(Date.now() / 1000) - 100, // 100 seconds ago
      exp: Math.floor(Date.now() / 1000) - 50    // expired 50 seconds ago
    };
    
    // Manually create an expired token
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = btoa(JSON.stringify(expiredPayload))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    // We need to sign this properly
    const token = generateToken({ userId: "123", email: "test@example.com" }, "0s");
    
    // Wait to ensure it's expired
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const decoded = verifyToken(token);
    expect(decoded).toBeNull();
  });

  test("Token payload contains userId and email", () => {
    const payload: TokenPayload = { userId: "456", email: "user@domain.com" };
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    
    expect(decoded).toBeDefined();
    expect(decoded?.userId).toBe("456");
    expect(decoded?.email).toBe("user@domain.com");
  });

  test("generateToken respects custom expiration", () => {
    const payload: TokenPayload = { userId: "789", email: "custom@example.com" };
    const token = generateToken(payload, "7d"); // 7 days
    const decoded = verifyToken(token);
    
    expect(decoded).toBeDefined();
    expect(decoded?.userId).toBe(payload.userId);
  });

  test("verifyToken handles missing JWT_SECRET", () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    
    const payload: TokenPayload = { userId: "123", email: "test@example.com" };
    
    // Should throw or handle gracefully
    expect(() => generateToken(payload)).toThrow();
    
    // Restore secret
    process.env.JWT_SECRET = originalSecret;
  });
});