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
// DurableObject types are also declared in server/jobs/durable-object.ts (merged).
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
import { getUserCount, createUser, isOidcConfigured, getOidcConfig, getUserByWatchlistShareToken, getTrackedTitles } from "./db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./middleware/auth";
import { rateLimiter, MemoryRateLimitStore, KvRateLimitStore } from "./middleware/rate-limit";
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
import integrationRoutes from "./routes/integrations";
import jobsCfRoutes from "./routes/jobs-cf";
import profileRoutes from "./routes/profile";
import socialRoutes from "./routes/social";
import ratingsRoutes from "./routes/ratings";
import recommendationsRoutes from "./routes/recommendations";
import suggestionsRoutes from "./routes/suggestions";
import invitationsRoutes from "./routes/invitations";
import healthRoutes from "./routes/health";
import statsRoutes from "./routes/stats";
import userSettingsRoutes from "./routes/user-settings";
import feedRoutes from "./routes/feed";
import kioskRoutes from "./routes/kiosk";
import shareRoutes from "./routes/share";
import importRoutes from "./routes/import";
import upNextRoutes from "./routes/up-next";
import overlapRoutes from "./routes/overlap";
import type { AppEnv } from "./types";
import { logger, requestLogger, resetLogLevel } from "./logger";
import { patchConfig, CONFIG } from "./config";
import Sentry from "./sentry";
import { withSentry } from "@sentry/cloudflare";
import { CloudflarePlatform } from "./platform/cloudflare";
import { armCron, enqueueOnce, processPending, recoverStale, runWithEnv, CRON_JOBS } from "./jobs/backend";
export { JobQueueDO } from "./jobs/durable-object";
import { createAuth } from "./auth/better-auth";
import { migrateAuthData } from "./db/migrate-auth";
import type { DrizzleDb } from "./platform/types";
import { runWithCache } from "./cache";
import { CloudflareKvCache } from "./cache/cloudflare-kv";
import { MemoryCache } from "./cache/memory";

interface Env {
  DB: D1Database;
  CACHE_KV?: KVNamespace;
  JOB_QUEUE_DO?: DurableObjectNamespace;
  JOB_QUEUE_BACKEND?: string;
  ASSETS?: { fetch: typeof fetch };
  TMDB_API_KEY?: string;
  TMDB_COUNTRY?: string;
  TMDB_LANGUAGE?: string;
  LOG_LEVEL?: string;
  CORS_ORIGIN?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
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
    JOB_QUEUE_BACKEND: (env.JOB_QUEUE_BACKEND as "d1" | "durable-object") || "d1",
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

  // Shared rate-limit store — KV-backed when available so all isolates share buckets;
  // falls back to in-memory when CACHE_KV binding is not configured.
  const rateLimitStore = env.CACHE_KV
    ? new KvRateLimitStore(env.CACHE_KV)
    : new MemoryRateLimitStore();

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
        // Keep the password inline in the human-readable message only —
        // do NOT pass it as a structured field so it isn't indexed by log
        // aggregators. The operator still sees it once in dev/server logs.
        const bootstrapLog = logger.child({ module: "worker-bootstrap" });
        bootstrapLog.warn(
          `Admin account created — default password: ${password} (change it after first login)`,
          { username: "admin" }
        );
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
    return c.json({ error: "Internal server error" }, 500);
  });

  // CORS — restricted to explicit origins via CORS_ORIGIN env var
  if (env.CORS_ORIGIN) {
    const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
    app.use("/api/*", cors({ origin: origins, credentials: true }));
  }

  // Request logging
  app.use("/api/*", requestLogger());

  // Global per-IP cap — applies to all /api/* before any per-route limiter.
  app.use(
    "/api/*",
    rateLimiter({ store: rateLimitStore, scope: "global", limit: CONFIG.GLOBAL_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 })
  );

  // Health check
  app.route("/api/health", healthRoutes);

  // Rate limit auth routes: 20 requests per minute to prevent brute-force attacks
  app.use("/api/auth/*", rateLimiter({ store: rateLimitStore, scope: "auth", limit: CONFIG.AUTH_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 }));

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
  const searchRateLimiter = rateLimiter({ store: rateLimitStore, scope: "search", limit: 30, windowMs: 60_000 });
  app.use("/api/search/*", searchRateLimiter, optionalAuth);
  app.use("/api/search", searchRateLimiter, optionalAuth);
  app.route("/api/search", searchRoutes);

  const browseRateLimiter = rateLimiter({ store: rateLimitStore, scope: "browse", limit: 30, windowMs: 60_000 });
  app.use("/api/browse/*", browseRateLimiter, optionalAuth);
  app.use("/api/browse", browseRateLimiter, optionalAuth);
  app.route("/api/browse", browseRoutes);

  app.use("/api/calendar/*", optionalAuth);
  app.use("/api/calendar", optionalAuth);
  app.route("/api/calendar", calendarRoutes);

  app.use("/api/user/*", optionalAuth);
  app.use("/api/user", optionalAuth);
  app.route("/api/user", profileRoutes);

  // Social routes — follow/unfollow (auth), follower/following lists (public), friends-loved (auth)
  app.use("/api/social/follow/*", requireAuth);
  app.use("/api/social/follow", requireAuth);
  app.use("/api/social/followers/*", optionalAuth);
  app.use("/api/social/followers", optionalAuth);
  app.use("/api/social/following/*", optionalAuth);
  app.use("/api/social/following", optionalAuth);
  app.use("/api/social/friends-loved", requireAuth);
  app.route("/api/social", socialRoutes);

  // Ratings routes — optionalAuth base, POST/DELETE check auth internally
  const ratingsRateLimiter = rateLimiter({ store: rateLimitStore, scope: "ratings", limit: 60, windowMs: 60_000 });
  app.use("/api/ratings/*", ratingsRateLimiter, optionalAuth);
  app.use("/api/ratings", ratingsRateLimiter, optionalAuth);
  app.route("/api/ratings", ratingsRoutes);

  // Recommendations routes (social broadcast)
  app.use("/api/recommendations/*", requireAuth);
  app.use("/api/recommendations", requireAuth);
  app.route("/api/recommendations", recommendationsRoutes);

  // Suggestions routes (TMDB-based)
  const suggestionsRateLimiter = rateLimiter({ store: rateLimitStore, scope: "suggestions", limit: 20, windowMs: 60_000 });
  app.use("/api/suggestions/*", suggestionsRateLimiter, requireAuth);
  app.use("/api/suggestions", suggestionsRateLimiter, requireAuth);
  app.route("/api/suggestions", suggestionsRoutes);

  // Invitations routes
  app.use("/api/invitations/*", requireAuth);
  app.use("/api/invitations", requireAuth);
  app.route("/api/invitations", invitationsRoutes);

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

  app.use("/api/integrations/*", requireAuth);
  app.use("/api/integrations", requireAuth);
  app.route("/api/integrations", integrationRoutes);

  app.use("/api/import/*", requireAuth);
  app.use("/api/import", requireAuth);
  app.route("/api/import", importRoutes);

  app.use("/api/stats/*", requireAuth);
  app.use("/api/stats", requireAuth);
  app.route("/api/stats", statsRoutes);

  // Up Next smart queue
  app.use("/api/up-next/*", requireAuth);
  app.use("/api/up-next", requireAuth);
  app.route("/api/up-next", upNextRoutes);

  // Overlap / "what to watch together" (requires auth)
  app.use("/api/overlap/*", requireAuth);
  app.use("/api/overlap", requireAuth);
  app.route("/api/overlap", overlapRoutes);

  app.use("/api/user/settings/*", requireAuth);
  app.route("/api/user/settings", userSettingsRoutes);

  // Calendar feed
  app.use("/api/feed/token*", requireAuth);
  app.route("/api/feed", feedRoutes);

  // Kiosk — /:token is public (token-authenticated); /token endpoints require session
  app.use("/api/kiosk/token*", requireAuth);
  app.route("/api/kiosk", kioskRoutes);

  // Share — /watchlist/:token is public; /token endpoints require session
  app.use("/api/share/token*", requireAuth);
  app.route("/api/share", shareRoutes);

  // Admin routes
  app.use("/api/admin/*", requireAuth, requireAdmin);
  app.use("/api/admin", requireAuth, requireAdmin);
  app.route("/api/admin", adminRoutes);

  // Maintenance endpoints are Bun-only (job queue + cache flush).
  // CF stub — all methods return 501 so the path is registered for route-parity.
  const maintenanceStub = new Hono<AppEnv>();
  maintenanceStub.all("/*", (c) =>
    c.json({ error: "Maintenance endpoints are only available on the Bun server" }, 501)
  );
  app.route("/api/admin/maintenance", maintenanceStub);

  // Jobs admin (CF Workers-compatible — uses Drizzle ORM + static cron map)
  app.use("/api/jobs/*", requireAuth, requireAdmin);
  app.use("/api/jobs", requireAuth, requireAdmin);
  app.route("/api/jobs", jobsCfRoutes);

  // Detail pages
  const detailsRateLimiter = rateLimiter({ store: rateLimitStore, scope: "details", limit: 60, windowMs: 60_000 });
  app.use("/api/details/*", detailsRateLimiter, optionalAuth);
  app.use("/api/details", detailsRateLimiter, optionalAuth);
  app.route("/api/details", detailsRoutes);

  // Sync (admin only — rate limited + require admin)
  const syncRateLimiter = rateLimiter({ store: rateLimitStore, scope: "sync", limit: 5, windowMs: 60_000 });
  app.use("/api/sync/*", syncRateLimiter);
  app.use("/api/sync", syncRateLimiter);
  app.use("/api/sync/*", requireAuth, requireAdmin);
  app.use("/api/sync", requireAuth, requireAdmin);
  app.route("/api/sync", syncRoutes);

  // Episodes (optionalAuth for upcoming/status, requireAuth for sync)
  app.use("/api/episodes/*", optionalAuth);
  app.use("/api/episodes", optionalAuth);
  app.route("/api/episodes", episodesRoutes);

  // OG meta tags for shared watchlist — before the generic SPA fallback
  app.get("/share/watchlist/:token", async (c) => {
    const token = c.req.param("token");
    const user = await getUserByWatchlistShareToken(token);
    let ogTags = "";
    if (user) {
      const titles = await getTrackedTitles(user.id);
      const count = titles.length;
      const username = user.displayUsername ?? user.username;
      const firstPoster = titles[0]?.poster_url
        ? `https://image.tmdb.org/t/p/w342${titles[0].poster_url}`
        : null;
      const description = `${count} title${count !== 1 ? "s" : ""} tracked by @${username}`;
      const imageTag = firstPoster
        ? `<meta property="og:image" content="${firstPoster}" />`
        : "";
      ogTags = `
    <meta property="og:title" content="${username}'s Watchlist — Remindarr" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    ${imageTag}
    <meta name="twitter:card" content="${firstPoster ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${username}'s Watchlist — Remindarr" />
    <meta name="twitter:description" content="${description}" />
    ${firstPoster ? `<meta name="twitter:image" content="${firstPoster}" />` : ""}`;
    }
    try {
      const assets = (c.env as unknown as Env).ASSETS;
      if (assets?.fetch) {
        const url = new URL("/index.html", c.req.url);
        const resp = await assets.fetch(url.toString());
        if (resp.ok) {
          const html = await resp.text();
          const injected = ogTags ? html.replace("</head>", `${ogTags}\n  </head>`) : html;
          return new Response(injected, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-cache, must-revalidate",
            },
          });
        }
      }
    } catch (err) {
      logger.error("Share OG fallback error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return c.html("<!DOCTYPE html><html><head><title>Remindarr</title></head><body></body></html>");
  });

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
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
            },
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

      const cfEnv = env as unknown as import("./jobs/backend").CFEnv;
      const response = await runWithEnv(cfEnv, () =>
        runWithCache(cache, () =>
          runWithDb(db, () => honoApp.fetch(request, env, ctx as any))
        )
      );

      // In D1 mode, drain ad-hoc jobs (e.g. sync-show-episodes queued on track)
      // in the background so they run without waiting for the next cron trigger.
      // In DO mode, DOs self-drive via alarms — no drain needed here.
      if (CONFIG.JOB_QUEUE_BACKEND !== "durable-object") {
        ctx.waitUntil(
          runWithEnv(cfEnv, () =>
            runWithCache(cache, () =>
              runWithDb(db, () => processPending())
            )
          ).catch((err) => {
            logger.error("Background job processing error", {
              error: err instanceof Error ? err.message : String(err),
            });
          })
        );
      }

      return response;
    } catch (err) {
      Sentry.captureException(err);
      logger.error("Worker fetch error", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return new Response(JSON.stringify({ error: "Internal server error" }), {
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

      const cfEnv = env as unknown as import("./jobs/backend").CFEnv;
      await runWithEnv(cfEnv, () => runWithCache(cache, () => runWithDb(db, async () => {
        logger.info("Scheduled bootstrap tick", { cron: event.cron });

        // Arm every cron-singleton DO. Idempotent — the DO only schedules its
        // alarm if no `runJob` cron schedule exists. DOs drive their own
        // sub-daily execution via @cloudflare/actors/alarms.
        for (const { name, cron } of CRON_JOBS) {
          await armCron(cfEnv, name, cron);
        }

        // One-time migrations (idempotent — no-ops once done)
        await enqueueOnce("migrate-offers");

        // Recover stuck jobs and drain D1 pending jobs (no-ops in DO mode)
        await recoverStale(cfEnv, 15);
        const processed = await processPending();
        if (processed > 0) {
          logger.info("Processed jobs", { count: processed });
        }
      })));
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
    release: env.SENTRY_RELEASE,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
  }),
  handler,
);
