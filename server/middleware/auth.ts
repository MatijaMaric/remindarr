import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { CONFIG } from "../config";
import { getSessionWithUser } from "../db/repository";
import type { AppEnv } from "../types";

/** Sets c.get("user") if a valid session exists. Does not block. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, CONFIG.SESSION_COOKIE_NAME);
  if (token) {
    const user = await getSessionWithUser(token);
    if (user) {
      c.set("user", user);
    }
  }
  await next();
});

/** Returns 401 if no valid session. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, CONFIG.SESSION_COOKIE_NAME);
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const user = await getSessionWithUser(token);
  if (!user) {
    return c.json({ error: "Session expired" }, 401);
  }
  c.set("user", user);
  await next();
});

/** Returns 403 if user is not admin. Must be used after requireAuth. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user?.is_admin) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
});
