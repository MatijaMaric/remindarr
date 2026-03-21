import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthUser } from "../types";

/** Sets c.get("user") if a valid session exists. Does not block. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.get("auth");
  if (auth) {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      if (session?.user) {
        const user: AuthUser = {
          id: session.user.id,
          username: (session.user as any).username || session.user.name || "",
          name: session.user.name,
          role: (session.user as any).role || null,
          is_admin: (session.user as any).role === "admin",
        };
        c.set("user", user);
      }
    } catch {
      // Invalid session — continue without user
    }
  }
  await next();
});

/** Returns 401 if no valid session. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) {
      return c.json({ error: "Session expired" }, 401);
    }
    const user: AuthUser = {
      id: session.user.id,
      username: (session.user as any).username || session.user.name || "",
      name: session.user.name,
      role: (session.user as any).role || null,
      is_admin: (session.user as any).role === "admin",
    };
    c.set("user", user);
  } catch {
    return c.json({ error: "Authentication required" }, 401);
  }

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
