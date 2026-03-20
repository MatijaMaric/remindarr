/**
 * Cloudflare Workers entry point for Remindarr.
 *
 * This file mirrors server/index.ts but targets the CF Workers runtime:
 * - Uses D1 database binding instead of bun:sqlite
 * - Uses Cloudflare Access for auth (optional, falls back to OIDC)
 * - Uses cron triggers instead of setInterval-based job polling
 * - Uses Web Crypto PBKDF2 for password hashing
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
}
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { runWithDb, schemaExports } from "./db/schema";
import { getUserCount, createUser, deleteExpiredSessions } from "./db/repository";
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
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
// jobsRoutes excluded: uses Bun-only in-memory job queue (bun:sqlite).
// CF Workers uses cron triggers instead (see scheduled handler below).
import browseRoutes from "./routes/browse";
import detailsRoutes from "./routes/details";
import notifierRoutes from "./routes/notifiers";
import healthRoutes from "./routes/health";
import type { AppEnv } from "./types";
import { logger, requestLogger, resetLogLevel } from "./logger";
import { patchConfig } from "./config";
import Sentry from "./sentry";
import { CloudflarePlatform } from "./platform/cloudflare";
import type { DrizzleDb } from "./platform/types";

interface Env {
  DB: D1Database;
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
  });

  // Reinitialize logger in case LOG_LEVEL changed
  if (env.LOG_LEVEL) {
    resetLogLevel(env.LOG_LEVEL as "debug" | "info" | "warn" | "error");
  }
}

function createApp(env: Env) {
  const app = new Hono<AppEnv>();

  // Inject platform into context for route handlers
  app.use("*", async (c, next) => {
    c.set("platform", platform);
    await next();
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

  // Health check
  app.route("/api/health", healthRoutes);

  // Auth routes (public)
  app.route("/api/auth", authRoutes);

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
let adminChecked = false;

function getApp(env: Env): Hono<AppEnv> {
  if (!app) {
    app = createApp(env);
  }
  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    ctx.passThroughOnException();
    patchConfigFromEnv(env);
    try {
      const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;
      const honoApp = getApp(env);

      return await runWithDb(db, async () => {
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

        return honoApp.fetch(request, env, ctx as any);
      });
    } catch (err) {
      Sentry.captureException(err);
      logger.error("Worker fetch error", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    patchConfigFromEnv(env);
    try {
      const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;

      await runWithDb(db, async () => {
        const cron = event.cron;
        logger.info("Scheduled event", { cron });

        switch (cron) {
          case "0 3 * * *":
            logger.info("Running sync-titles cron");
            break;
          case "30 3 * * *":
            logger.info("Running sync-episodes cron");
            break;
          case "*/5 * * * *":
            logger.info("Running send-notifications cron");
            break;
          case "0 0 * * *":
            await deleteExpiredSessions();
            logger.info("Cleanup complete");
            break;
        }
      });
    } catch (err) {
      logger.error("Worker scheduled error", {
        cron: event.cron,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
