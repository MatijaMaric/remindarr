import { Hono } from "hono";
import { isOidcConfigured } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

// GET /api/auth/custom/providers
app.get("/providers", async (c) => {
  const oidcConfigured = await isOidcConfigured();
  return c.json({
    local: true,
    oidc: oidcConfigured ? { name: "OpenID Connect", providerId: "pocketid" } : null,
  });
});

export default app;
