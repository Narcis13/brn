import { Hono } from "hono";
import { createUser, findUserByEmail } from "../user.repo";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateToken } from "../auth/jwt";
import { getDb } from "../db";
import { authMiddleware, getAuthContext } from "../auth/middleware";

export const authRoutes = new Hono();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const DB_PATH = () => Bun.env.DB_PATH ?? "./data/app.db";

function validateAuthInput(email: string | undefined, password: string | undefined) {
  if (!email || !password) {
    return { error: "Email and password are required", status: 400 };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Invalid email format", status: 400 };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }

  return null;
}

authRoutes.post("/signup", async (c) => {
  const { email, password } = await c.req.json();

  const validationError = validateAuthInput(email, password);
  if (validationError) {
    return c.json({ error: validationError.error }, validationError.status);
  }

  const db = getDb(DB_PATH());
  const existingUser = findUserByEmail(db, email);
  if (existingUser) {
    return c.json({ error: "User already exists" }, 409);
  }

  const hashedPassword = await hashPassword(password);
  const user = createUser(db, { email, passwordHash: hashedPassword });
  
  const token = generateToken({ userId: user.id, email });
  
  return c.json({ token }, 201);
});

authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const db = getDb(DB_PATH());
  const user = findUserByEmail(db, email);
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const isValidPassword = await verifyPassword(user.passwordHash, password);
  if (!isValidPassword) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = generateToken({ userId: user.id, email: user.email });

  return c.json({ token }, 200);
});

authRoutes.get("/me", authMiddleware, (c) => {
  const authContext = getAuthContext(c);
  if (!authContext) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  return c.json({
    userId: authContext.userId,
    email: authContext.email
  });
});