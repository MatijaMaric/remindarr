/**
 * Cloudflare Workers entry point for Remindarr.
 *
 * This file mirrors server/index.ts but targets the CF Workers runtime:
 * - Uses D1 database binding instead of bun:sqlite
 * - Uses cron triggers instead of setInterval-based job polling
 * - Uses Web Crypto PBKDF2 for password hashing
 *
 * Schema migrations are applied via `wrangler d1 migrations apply` before
 * deploying. Data migrations run once on first request per isolate.
 */

// CF Workers types — these are provided by @cloudflare/workers-types at deploy time.
// Declared here so the file compiles with bun's tsc too.
declare global {
  interface D1Database {
    prepare(query: string): any;
    batch(statements: any[]): Promise<any[]>;
    exec(query: string): Promise<any>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
  }
  interface ScheduledEvent {
    cron: string;
    type: string;
    scheduledTime: number;
  }
  interface KVNamespace {
    get(key: string, type: "text"): Promise<string | null>;
    get(key: string, type: "json"): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { getDb, runWithDb, schemaExports } from "./db/schema";
import { getUserCount, createUser, deleteExpiredSessions, isOidcConfigured, getOidcConfig } from "./db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./middleware/auth";
import { rateLimiter } from "./middleware/rate-limit";
import syncRoutes from "./routes/sync";
import titlesRoutes from "./routes/titles";
import searchRoutes from "./routes/search";
import trackRoutes from "./routes/track";
import watchedRoutes from "./routes/watched";
import imdbRoutes from "./routes/imdb";
import calendarRoutes from "./routes/calendar";
import episodesRoutes from "./routes/episodes";
import authCustomRoutes from "./routes/auth-custom";
import adminRoutes, { setOnOidcSettingsChanged } from "./routes/admin";
// jobsRoutes excluded: uses Bun-only in-memory job queue (bun:sqlite).
// CF Workers uses cron triggers instead (see scheduled handler below).
import browseRoutes from "./routes/browse";
import detailsRoutes from "./routes/details";
import notifierRoutes from "./routes/notifiers";
import profileRoutes from "./routes/profile";
import healthRoutes from "./routes/health";
import type { AppEnv } from "./types";
import { logger, requestLogger, resetLogLevel } from "./logger";
import { patchConfig } from "./config";
import Sentry from "./sentry";
import { withSentry } from "@sentry/cloudflare";
import { CloudflarePlatform } from "./platform/cloudflare";
import { processPendingJobs, enqueueCronJob, enqueueOneTimeMigration, cleanupOldJobs } from "./jobs/processor";
import { createAuth } from "./auth/better-auth";
import { migrateAuthData } from "./db/migrate-auth";
import type { DrizzleDb } from "./platform/types";
import { runWithCache } from "./cache";
import { CloudflareKvCache } from "./cache/cloudflare-kv";
import { MemoryCache } from "./cache/memory";

interface Env {
  DB: D1Database;
  CACHE_KV?: KVNamespace;
  ASSETS?: { fetch: typeof fetch };
  TMDB_API_KEY?: string;
  TMDB_COUNTRY?: string;
  TMDB_LANGUAGE?: string;
  LOG_LEVEL?: string;
  CORS_ORIGIN?: string;
  SENTRY_DSN?: string;
  OIDC_ISSUER_URL?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_ADMIN_CLAIM?: string;
  OIDC_ADMIN_VALUE?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  BETTER_AUTH_SECRET?: string;
  BASE_URL?: string;
  PASSKEY_RP_ID?: string;
  PASSKEY_RP_NAME?: string;
  PASSKEY_ORIGIN?: string;
  STREAMING_AVAILABILITY_API_KEY?: string;
}

const platform = new CloudflarePlatform();
let configPatched = false;

/**
 * Patch the global CONFIG singleton with CF Workers env bindings.
 * Secrets and vars are only available via the env parameter, not process.env.
 * Only patches once per isolate lifetime (values don't change between requests).
 */
function patchConfigFromEnv(env: Env): void {
  if (configPatched) return;
  configPatched = true;

  patchConfig({
    TMDB_API_KEY: env.TMDB_API_KEY || "",
    COUNTRY: env.TMDB_COUNTRY || undefined,
    LANGUAGE: env.TMDB_LANGUAGE || undefined,
    LOG_LEVEL: (env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || undefined,
    CORS_ORIGIN: env.CORS_ORIGIN || undefined,
    SENTRY_DSN: env.SENTRY_DSN || "",
    OIDC_ISSUER_URL: env.OIDC_ISSUER_URL || "",
    OIDC_CLIENT_ID: env.OIDC_CLIENT_ID || "",
    OIDC_CLIENT_SECRET: env.OIDC_CLIENT_SECRET || "",
    OIDC_REDIRECT_URI: env.OIDC_REDIRECT_URI || "",
    OIDC_ADMIN_CLAIM: env.OIDC_ADMIN_CLAIM || "",
    OIDC_ADMIN_VALUE: env.OIDC_ADMIN_VALUE || "",
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY || "",
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY || "",
    VAPID_SUBJECT: env.VAPID_SUBJECT || "",
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || "",
    BASE_URL: env.BASE_URL || undefined,
    PASSKEY_RP_ID: env.PASSKEY_RP_ID || undefined,
    PASSKEY_RP_NAME: env.PASSKEY_RP_NAME || undefined,
    PASSKEY_ORIGIN: env.PASSKEY_ORIGIN || undefined,
    STREAMING_AVAILABILITY_API_KEY: env.STREAMING_AVAILABILITY_API_KEY || "",
  });

  // Reinitialize logger in case LOG_LEVEL changed
  if (env.LOG_LEVEL) {
    resetLogLevel(env.LOG_LEVEL as "debug" | "info" | "warn" | "error");
  }
}

// ─── Per-isolate state (survives across requests within the same Worker instance) ──

let adminChecked = false;
let oidcConfigLoaded = false;
let cachedOidcConfig: Parameters<typeof createAuth>[2] | undefined;

/** Invalidate cached OIDC config (called when admin updates settings). */
function invalidateOidcConfig(): void {
  oidcConfigLoaded = false;
  cachedOidcConfig = undefined;
}

/** Resolve OIDC config once per isolate, caching the result. */
async function resolveOidcConfig(): Promise<typeof cachedOidcConfig> {
  if (oidcConfigLoaded) return cachedOidcConfig;
  oidcConfigLoaded = true;

  if (await isOidcConfigured()) {
    const config = await getOidcConfig();
    cachedOidcConfig = {
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      adminClaim: config.adminClaim,
      adminValue: config.adminValue,
    };
  }
  return cachedOidcConfig;
}

function createApp(env: Env) {
  const app = new Hono<AppEnv>();

  // Per-request setup: inject platform and auth into context.
  // One-time initialization (migration, admin creation, OIDC config) is
  // guarded by module-level flags so it only runs on the first request.
  app.use("*", async (c, next) => {
    c.set("platform", platform);

    // One-time data migration (skipped after first successful check)
    await migrateAuthData();

    // Create admin on first request if no users exist
    if (!adminChecked) {
      adminChecked = true;
      const userCount = await getUserCount();
      if (userCount === 0) {
        const password = crypto.randomUUID().slice(0, 16);
        const hash = await platform.hashPassword(password);
        await createUser("admin", hash, "Admin", "local", undefined, true);
        logger.info("Admin account created", { username: "admin", password });
      }
    }

    // Create auth instance per-request (D1 binding is per-request),
    // but reuse cached OIDC config to avoid DB queries every time.
    const oidcConfig = await resolveOidcConfig();
    const db = getDb();
    c.set("auth", createAuth(db, platform, oidcConfig));

    await next();
  });

  // Wire up OIDC settings invalidation so admin changes take effect
  setOnOidcSettingsChanged(async () => {
    invalidateOidcConfig();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    Sentry.captureException(err);
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    return c.json({ error: "Internal server error", detail: err.message, stack: err.stack }, 500);
  });

  // CORS — restricted to explicit origins via CORS_ORIGIN env var
  if (env.CORS_ORIGIN) {
    const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
    app.use("/api/*", cors({ origin: origins, credentials: true }));
  }

  // Request logging
  app.use("/api/*", requestLogger());

  // Health check
  app.route("/api/health", healthRoutes);

  // Custom auth routes (providers endpoint) — must be before better-auth catch-all
  app.route("/api/auth/custom", authCustomRoutes);

  // better-auth handler (handles /api/auth/* — sign-in, sign-up, session, etc.)
  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const authInstance = c.get("auth");
    if (!authInstance) {
      return c.json({ error: "Auth not initialized" }, 500);
    }
    return authInstance.handler(c.req.raw);
  });

  // Public API routes (optionalAuth for is_tracked)
  app.use("/api/titles/*", optionalAuth);
  app.use("/api/titles", optionalAuth);
  app.route("/api/titles", titlesRoutes);

  // Rate limit search
  app.use("/api/search/*", rateLimiter({ limit: 30, windowMs: 60_000 }));
  app.use("/api/search", rateLimiter({ limit: 30, windowMs: 60_000 }));
  app.use("/api/search/*", optionalAuth);
  app.use("/api/search", optionalAuth);
  app.route("/api/search", searchRoutes);

  app.use("/api/browse/*", optionalAuth);
  app.use("/api/browse", optionalAuth);
  app.route("/api/browse", browseRoutes);

  app.use("/api/calendar/*", optionalAuth);
  app.use("/api/calendar", optionalAuth);
  app.route("/api/calendar", calendarRoutes);

  app.use("/api/user/*", optionalAuth);
  app.use("/api/user", optionalAuth);
  app.route("/api/user", profileRoutes);

  // Protected routes
  app.use("/api/track/*", requireAuth);
  app.use("/api/track", requireAuth);
  app.route("/api/track", trackRoutes);

  app.use("/api/watched/*", requireAuth);
  app.use("/api/watched", requireAuth);
  app.route("/api/watched", watchedRoutes);

  app.use("/api/imdb/*", requireAuth);
  app.use("/api/imdb", requireAuth);
  app.route("/api/imdb", imdbRoutes);

  app.use("/api/notifiers/*", requireAuth);
  app.use("/api/notifiers", requireAuth);
  app.route("/api/notifiers", notifierRoutes);

  // Admin routes
  app.use("/api/admin/*", requireAuth, requireAdmin);
  app.use("/api/admin", requireAuth, requireAdmin);
  app.route("/api/admin", adminRoutes);

  // /api/jobs not available on CF Workers (uses Bun-only in-memory queue)

  // Detail pages
  app.use("/api/details/*", optionalAuth);
  app.use("/api/details", optionalAuth);
  app.route("/api/details", detailsRoutes);

  // Sync
  app.use("/api/sync/*", rateLimiter({ limit: 5, windowMs: 60_000 }));
  app.use("/api/sync", rateLimiter({ limit: 5, windowMs: 60_000 }));
  app.route("/api/sync", syncRoutes);

  // Episodes
  app.use("/api/episodes/*", optionalAuth);
  app.use("/api/episodes", optionalAuth);
  app.route("/api/episodes", episodesRoutes);

  // SPA fallback — serve index.html for client-side routes (mirrors serveStatic in index.ts)
  app.get("*", async (c) => {
    // Skip API paths that weren't matched by any route
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      const assets = (c.env as unknown as Env).ASSETS;
      if (assets?.fetch) {
        const url = new URL("/index.html", c.req.url);
        const resp = await assets.fetch(url.toString());
        if (resp.ok) {
          return new Response(resp.body, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      }
    } catch (err) {
      logger.error("SPA fallback error", {
        error: err instanceof Error ? err.message : String(err),
        path: c.req.path,
      });
    }
    return c.text("Not Found", 404);
  });

  return app;
}

let app: Hono<AppEnv> | null = null;

function getApp(env: Env): Hono<AppEnv> {
  if (!app) {
    app = createApp(env);
  }
  return app;
}

const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    ctx.passThroughOnException();
    patchConfigFromEnv(env);
    try {
      const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;
      const honoApp = getApp(env);
      const cache = env.CACHE_KV
        ? new CloudflareKvCache(env.CACHE_KV)
        : new MemoryCache();

      const response = await runWithCache(cache, () =>
        runWithDb(db, () => honoApp.fetch(request, env, ctx as any))
      );

      // Process pending jobs in the background after each request.
      // This ensures ad-hoc jobs (e.g. sync-show-episodes queued on track)
      // are picked up promptly without waiting for the next cron trigger.
      ctx.waitUntil(
        runWithCache(cache, () =>
          runWithDb(db, () => processPendingJobs())
        ).catch((err) => {
          logger.error("Background job processing error", {
            error: err instanceof Error ? err.message : String(err),
          });
        })
      );

      return response;
    } catch (err) {
      Sentry.captureException(err);
      logger.error("Worker fetch error", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      return new Response(JSON.stringify({ error: msg, stack }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    patchConfigFromEnv(env);
    try {
      const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;
      const cache = env.CACHE_KV
        ? new CloudflareKvCache(env.CACHE_KV)
        : new MemoryCache();

      await runWithCache(cache, () => runWithDb(db, async () => {
        const cron = event.cron;
        logger.info("Scheduled event", { cron });

        // Map cron triggers to job names and enqueue if not already pending
        switch (cron) {
          case "0 3 * * *":
            await enqueueCronJob("sync-titles");
            break;
          case "30 3 * * *":
            await enqueueCronJob("sync-episodes");
            break;
          case "0 4 * * *":
            await enqueueCronJob("sync-deep-links");
            break;
          case "*/5 * * * *":
            await enqueueCronJob("send-notifications");
            break;
          case "0 0 * * *":
            await deleteExpiredSessions();
            await cleanupOldJobs(30);
            logger.info("Cleanup complete");
            break;
        }

        // One-time migrations: enqueue if no job exists at all for this name
        await enqueueOneTimeMigration("migrate-offers");
        await enqueueOneTimeMigration("sync-deep-links");

        // Process all pending jobs (cron-triggered + ad-hoc like sync-show-episodes)
        const processed = await processPendingJobs();
        if (processed > 0) {
          logger.info("Processed jobs", { count: processed, cron });
        }
      }));
    } catch (err) {
      Sentry.captureException(err);
      logger.error("Worker scheduled error", {
        cron: event.cron,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

export default withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  }),
  handler,
);
