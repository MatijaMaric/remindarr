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
import jobsRoutes from "./routes/jobs";
import browseRoutes from "./routes/browse";
import detailsRoutes from "./routes/details";
import notifierRoutes from "./routes/notifiers";
import healthRoutes from "./routes/health";
import type { AppEnv } from "./types";
import { logger, requestLogger } from "./logger";
import { CloudflarePlatform } from "./platform/cloudflare";
import type { DrizzleDb } from "./platform/types";

interface Env {
  DB: D1Database;
  TMDB_API_KEY?: string;
  TMDB_COUNTRY?: string;
  TMDB_LANGUAGE?: string;
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

function createApp() {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    logger.error("Unhandled error", { error: err.message });
    return c.json({ error: "Internal server error" }, 500);
  });

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

  app.use("/api/jobs/*", requireAuth, requireAdmin);
  app.use("/api/jobs", requireAuth, requireAdmin);
  app.route("/api/jobs", jobsRoutes);

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

  return app;
}

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;
    const platform = new CloudflarePlatform();

    return runWithDb(db, async () => {
      // Inject platform + CORS
      const originalFetch = app.fetch;

      // Set up CORS if configured
      if (env.CORS_ORIGIN) {
        const origins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
        app.use(
          "/api/*",
          cors({ origin: origins, credentials: true })
        );
      }

      // Create admin on first request if no users exist
      const userCount = await getUserCount();
      if (userCount === 0) {
        const password = crypto.randomUUID().slice(0, 16);
        const hash = await platform.hashPassword(password);
        await createUser("admin", hash, "Admin", "local", undefined, true);
        logger.info("Admin account created", { username: "admin", password });
      }

      // Use a middleware-like approach to inject platform
      const url = new URL(request.url);
      const c = { set: () => {} }; // Hono will handle this via middleware

      return app.fetch(request, { ...env, platform } as any, ctx as any);
    });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = drizzle(env.DB, { schema: schemaExports }) as unknown as DrizzleDb;

    await runWithDb(db, async () => {
      const cron = event.cron;
      logger.info("Scheduled event", { cron });

      switch (cron) {
        case "0 3 * * *":
          // sync-titles
          logger.info("Running sync-titles cron");
          break;
        case "30 3 * * *":
          // sync-episodes
          logger.info("Running sync-episodes cron");
          break;
        case "*/5 * * * *":
          // send-notifications
          logger.info("Running send-notifications cron");
          break;
        case "0 0 * * *":
          // cleanup
          await deleteExpiredSessions();
          logger.info("Cleanup complete");
          break;
      }
    });
  },
};
