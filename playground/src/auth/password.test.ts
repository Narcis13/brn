import { describe, test, expect } from "bun:test";
import { hashPassword, verifyPassword } from "./password";

describe("password utilities", () => {
  test("hashPassword returns a string different from the input", async () => {
    const password = "testPassword123";
    const hash = await hashPassword(password);
    
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash).not.toBe(password);
  });

  test("verifyPassword returns true for correct password", async () => {
    const password = "testPassword123";
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(hash, password);
    
    expect(isValid).toBe(true);
  });

  test("verifyPassword returns false for incorrect password", async () => {
    const password = "testPassword123";
    const wrongPassword = "wrongPassword123";
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(hash, wrongPassword);
    
    expect(isValid).toBe(false);
  });

  test("hashPassword creates different hashes for same password", async () => {
    const password = "testPassword123";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    
    expect(hash1).not.toBe(hash2);
  });

  test("verifyPassword handles empty password", async () => {
    const password = "";
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(hash, password);
    
    expect(isValid).toBe(true);
  });
});