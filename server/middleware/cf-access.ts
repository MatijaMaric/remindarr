import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Cloudflare Access JWT verification middleware.
 *
 * When deployed behind Cloudflare Access, the `Cf-Access-Jwt-Assertion`
 * header contains a signed JWT. This middleware decodes it and sets the
 * user in context. The JWT is already verified by Cloudflare's edge —
 * we only decode the payload to extract user identity.
 *
 * For additional security, you can verify the JWT signature against
 * Cloudflare's JWKS endpoint: https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
 */
export const cfAccessAuth = createMiddleware<AppEnv>(async (c, next) => {
  const jwt = c.req.header("Cf-Access-Jwt-Assertion");
  if (!jwt) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    // Decode payload (base64url-encoded JSON, second segment of JWT)
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      return c.json({ error: "Invalid token format" }, 401);
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

    if (!payload.email) {
      return c.json({ error: "Token missing email claim" }, 401);
    }

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return c.json({ error: "Token expired" }, 401);
    }

    c.set("user", {
      id: payload.sub || payload.email,
      username: payload.email,
      display_name: payload.name || payload.email.split("@")[0],
      auth_provider: "cloudflare-access",
      is_admin: false, // Configure admin via Cloudflare Access groups
    });

    await next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});
