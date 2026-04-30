import "./instrument";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { CONFIG } from "./config";
import { initBunDb, migrateTrackedData, getRawDb } from "./db/bun-db";
import { getUserCount, createUser, getUserByWatchlistShareToken, getTrackedTitles } from "./db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./middleware/auth";
import { rateLimiter, MemoryRateLimitStore } from "./middleware/rate-limit";
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
import jobsRoutes from "./routes/jobs";
import browseRoutes from "./routes/browse";
import detailsRoutes from "./routes/details";
import notifierRoutes from "./routes/notifiers";
import integrationRoutes from "./routes/integrations";
import importRoutes from "./routes/import";
import profileRoutes from "./routes/profile";
import socialRoutes from "./routes/social";
import ratingsRoutes from "./routes/ratings";
import recommendationsRoutes from "./routes/recommendations";
import invitationsRoutes from "./routes/invitations";
import healthRoutes from "./routes/health";
import metricsRoutes from "./routes/metrics";
import statsRoutes from "./routes/stats";
import userSettingsRoutes from "./routes/user-settings";
import feedRoutes from "./routes/feed";
import kioskRoutes from "./routes/kiosk";
import upNextRoutes from "./routes/up-next";
import shareRoutes from "./routes/share";
import overlapRoutes from "./routes/overlap";
import type { AppEnv } from "./types";
import Sentry from "./sentry";
import { logger, requestLogger } from "./logger";
import { classifyError } from "./lib/error-classifier";
import { errorsByCategory } from "./metrics";
import { registerSyncJobs } from "./jobs/sync";
import { registerNotificationJobs } from "./jobs/notifications";
import { registerBackupJob } from "./jobs/backup";
import { registerPruneNotificationLogJob } from "./jobs/prune-notification-log";
import { startWorker, stopWorker } from "./jobs/worker";
import { createShutdownHandler } from "./graceful-shutdown";
import { registerCron } from "./jobs/queue";
import { setScheduleCallback } from "./jobs/schedule";
import { BunPlatform } from "./platform/bun";
import { createAuthWithOidc, type BetterAuthInstance } from "./auth/better-auth";
import { migrateAuthData } from "./db/migrate-auth";
import { validateStartup } from "./startup-validation";
import { createCache, initCache } from "./cache";
import fs from "node:fs";
import path from "node:path";

// Validate required configuration before anything else
validateStartup();

// Initialize DB on startup
initBunDb();

// Initialize distributed cache
const cache = await createCache();
initCache(cache);

// Shared rate-limit store — single instance so all middleware shares the same buckets.
const rateLimitStore = new MemoryRateLimitStore();

const platform = new BunPlatform();

// Run auth migration
await migrateAuthData();

// Create admin account on first launch
if (await getUserCount() === 0) {
  const password = crypto.randomUUID().slice(0, 16);
  const hash = await platform.hashPassword(password);
  const adminId = await createUser("admin", hash, "Admin", "local", undefined, true);
  migrateTrackedData(adminId);

  // Write the password to a file next to the DB rather than stdout so that
  // log aggregators don't permanently archive the initial secret. Chmod 600
  // on POSIX; on Windows we fall back to the default ACL.
  const passwordFile = path.resolve(
    path.dirname(CONFIG.DB_PATH === ":memory:" ? "./remindarr.db" : CONFIG.DB_PATH),
    "admin-password.txt"
  );
  try {
    fs.writeFileSync(
      passwordFile,
      `Default admin password: ${password}\nChange it after first login, then delete this file.\n`,
      { mode: 0o600 }
    );
    logger.warn("Admin account created — default password written to file", {
      username: "admin",
      passwordFile,
    });
  } catch (err) {
    // If we can't write the file (read-only FS, permissions), fall back to
    // the structured log so the operator can still recover the password.
    logger.warn("Admin account created — could not write password file, logging instead", {
      username: "admin",
      password,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Create auth instance (singleton for Bun)
let auth: BetterAuthInstance;
async function getAuth() {
  if (!auth) {
    const { getDb } = await import("./db/schema");
    auth = await createAuthWithOidc(getDb(), platform);
  }
  return auth;
}

// Eagerly initialize auth
auth = await getAuth();

// Register callback so admin routes can recreate auth on OIDC settings change
setOnOidcSettingsChanged(async () => {
  const { getDb } = await import("./db/schema");
  auth = await createAuthWithOidc(getDb(), platform);
});

const app = new Hono<AppEnv>();

// Inject platform and auth into context for route handlers
app.use("*", async (c, next) => {
  c.set("platform", platform);
  c.set("auth", auth);
  await next();
});

const log = logger.child({ module: "index" });

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  const category = classifyError(err);
  errorsByCategory.inc({ category });

  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

  (Sentry.addBreadcrumb as (opts: { message: string; data: Record<string, string> }) => void)?.({
    message: "Unhandled error",
    data: { category, requestId },
  });
  Sentry.captureException(err);

  log.error("Unhandled error", { category, requestId, err });

  return c.json({ error: "Internal server error" }, 500, {
    "X-Request-Id": requestId,
  });
});

// CORS — restricted to explicit origins via CORS_ORIGIN env var (comma-separated).
// When not set, no CORS headers are sent (same-origin policy applies).
if (CONFIG.CORS_ORIGIN) {
  const origins = CONFIG.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    "/api/*",
    cors({
      origin: origins,
      credentials: true,
    }),
  );
}

// Request logging
app.use("/api/*", requestLogger());

// Global per-IP cap — applies to all /api/* before any per-route limiter.
// Prevents aggregate abuse across routes from a single client.
app.use(
  "/api/*",
  rateLimiter({ store: rateLimitStore, scope: "global", limit: CONFIG.GLOBAL_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 })
);

// Health check (public — used by Sentry uptime monitoring)
app.route("/api/health", healthRoutes);

// Prometheus metrics (public — protect via reverse proxy if needed)
app.route("/metrics", metricsRoutes);

// Rate limit auth routes to prevent brute-force attacks. Defaults to 20/min,
// configurable via AUTH_RATE_LIMIT_PER_MINUTE for environments (like e2e) that
// need a higher cap.
app.use(
  "/api/auth/*",
  rateLimiter({ store: rateLimitStore, scope: "auth", limit: CONFIG.AUTH_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 })
);

// Custom auth routes (providers endpoint) — must be before better-auth catch-all
app.route("/api/auth/custom", authCustomRoutes);

// better-auth handler (handles /api/auth/* — sign-in, sign-up, session, etc.)
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Public API routes (optionalAuth for is_tracked)
app.use("/api/titles/*", optionalAuth);
app.use("/api/titles", optionalAuth);
app.route("/api/titles", titlesRoutes);

// Rate limit search: 30 requests per minute
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

// Rate limit write-heavy routes: 60 requests per minute per IP.
// Applied before requireAuth so floods are rejected cheaply.
const writeRateLimiter = rateLimiter({ store: rateLimitStore, scope: "writes", limit: 60, windowMs: 60_000 });

// Ratings routes — optionalAuth base, POST/DELETE check auth internally.
// Rate-limit applies to all (reads + writes) so unauth scrapers get throttled too.
app.use("/api/ratings/*", writeRateLimiter, optionalAuth);
app.use("/api/ratings", writeRateLimiter, optionalAuth);
app.route("/api/ratings", ratingsRoutes);

// Recommendations routes
app.use("/api/recommendations/*", requireAuth);
app.use("/api/recommendations", requireAuth);
app.route("/api/recommendations", recommendationsRoutes);

// Invitations routes
app.use("/api/invitations/*", requireAuth);
app.use("/api/invitations", requireAuth);
app.route("/api/invitations", invitationsRoutes);

// Protected routes
app.use("/api/track/*", writeRateLimiter, requireAuth);
app.use("/api/track", writeRateLimiter, requireAuth);
app.route("/api/track", trackRoutes);

app.use("/api/watched/*", writeRateLimiter, requireAuth);
app.use("/api/watched", writeRateLimiter, requireAuth);
app.route("/api/watched", watchedRoutes);

app.use("/api/imdb/*", writeRateLimiter, requireAuth);
app.use("/api/imdb", writeRateLimiter, requireAuth);
app.route("/api/imdb", imdbRoutes);

app.use("/api/notifiers/*", writeRateLimiter, requireAuth);
app.use("/api/notifiers", writeRateLimiter, requireAuth);
app.route("/api/notifiers", notifierRoutes);

app.use("/api/integrations/*", writeRateLimiter, requireAuth);
app.use("/api/integrations", writeRateLimiter, requireAuth);
app.route("/api/integrations", integrationRoutes);

// Import is more expensive per request — tighter cap.
const importRateLimiter = rateLimiter({ store: rateLimitStore, scope: "import", limit: 10, windowMs: 60_000 });
app.use("/api/import/*", importRateLimiter, requireAuth);
app.use("/api/import", importRateLimiter, requireAuth);
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
app.use("/api/user/settings", requireAuth);
app.route("/api/user/settings", userSettingsRoutes);

// Calendar feed — /calendar.ics is public (token-authenticated); /token endpoints require session
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

app.use("/api/jobs/*", requireAuth, requireAdmin);
app.use("/api/jobs", requireAuth, requireAdmin);
app.route("/api/jobs", jobsRoutes);

// Detail pages (optionalAuth for is_tracked)
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

// OG meta tags for shared watchlist page — must be before the SPA static fallback
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
    const indexHtml = await Bun.file("./frontend/dist/index.html").text();
    const injected = ogTags
      ? indexHtml.replace("</head>", `${ogTags}\n  </head>`)
      : indexHtml;
    return new Response(injected, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    // Fall through to static serving if dist/index.html doesn't exist (dev mode)
  }
  return c.html("<!DOCTYPE html><html><head><title>Remindarr</title></head><body></body></html>");
});

// Serve frontend static files in production
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.use("/*", serveStatic({ root: "./frontend/dist", path: "/index.html" }));

// Start background job queue
setScheduleCallback(registerCron);
registerSyncJobs();
await registerNotificationJobs();
registerBackupJob();
registerPruneNotificationLogJob();
startWorker();

const server = Bun.serve({
  port: CONFIG.PORT,
  fetch: app.fetch,
});

logger.info("Server started", { port: CONFIG.PORT });

const shutdown = createShutdownHandler({
  server,
  stopWorker,
  closeDb: () => getRawDb().close(),
  closeCache: () => cache.close?.() ?? Promise.resolve(),
});

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
