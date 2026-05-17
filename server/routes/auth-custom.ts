import { Hono } from "hono";
import { isOidcConfigured } from "../db/repository";
import { logger } from "../logger";
import Sentry from "../sentry";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();
const log = logger.child({ module: "auth-custom" });

// GET /api/auth/custom/providers
app.get("/providers", async (c) => {
  try {
    const oidcConfigured = await isOidcConfigured();
    return c.json({
      local: true,
      oidc: oidcConfigured ? { name: "OpenID Connect", providerId: "pocketid" } : null,
      passkey: true,
    });
  } catch (err: unknown) {
    Sentry.captureException(err);
    log.error("oidc config lookup failed; serving safe defaults", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ local: true, oidc: null, passkey: true });
  }
});

export default app;
