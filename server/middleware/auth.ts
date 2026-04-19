import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthUser } from "../types";

/**
 * Shape of the `user` returned by better-auth after our plugins (username,
 * admin, passkey) extend it. These fields aren't in better-auth's base typing
 * so we narrow here instead of sprinkling `as any` at every call site.
 */
type BetterAuthSessionUser = {
  id: string;
  name?: string | null;
  username?: string | null;
  role?: string | null;
};

function toAuthUser(sessionUser: BetterAuthSessionUser): AuthUser {
  const role = sessionUser.role ?? null;
  return {
    id: sessionUser.id,
    username: sessionUser.username ?? sessionUser.name ?? "",
    name: sessionUser.name ?? null,
    role,
    is_admin: role === "admin",
  };
}

/** Sets c.get("user") if a valid session exists. Does not block. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.get("auth");
  if (auth) {
    try {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });
      if (session?.user) {
        c.set("user", toAuthUser(session.user as BetterAuthSessionUser));
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
    c.set("user", toAuthUser(session.user as BetterAuthSessionUser));
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
