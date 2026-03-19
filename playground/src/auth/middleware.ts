import type { Context, Next } from "hono";
import { verifyToken } from "./jwt";
import type { AuthContext } from "../types";

const AUTH_CONTEXT_KEY = "authContext";

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const token = parts[1];
  const payload = verifyToken(token);
  
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const authContext: AuthContext = {
    userId: payload.userId,
    email: payload.email
  };
  
  c.set(AUTH_CONTEXT_KEY, authContext);
  
  await next();
}

export function getAuthContext(c: Context): AuthContext | null {
  return c.get(AUTH_CONTEXT_KEY) || null;
}