import "./instrument";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { CONFIG } from "./config";
import { initBunDb, migrateTrackedData, getRawDb } from "./db/bun-db";
import { getUserCount, createUser } from "./db/repository";
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
import type { AppEnv } from "./types";
import Sentry from "./sentry";
import { logger, requestLogger } from "./logger";
import { registerSyncJobs } from "./jobs/sync";
import { registerNotificationJobs } from "./jobs/notifications";
import { registerBackupJob } from "./jobs/backup";
import { startWorker, stopWorker } from "./jobs/worker";
import { createShutdownHandler } from "./graceful-shutdown";
import { registerCron } from "./jobs/queue";
import { setScheduleCallback } from "./jobs/schedule";
import { BunPlatform } from "./platform/bun";
import { createAuthWithOidc, type BetterAuthInstance } from "./auth/better-auth";
import { migrateAuthData } from "./db/migrate-auth";
import { validateStartup } from "./startup-validation";
import { createCache, initCache } from "./cache";

// Validate required configuration before anything else
validateStartup();

// Initialize DB on startup
initBunDb();

// Initialize distributed cache
const cache = await createCache();
initCache(cache);

const platform = new BunPlatform();

// Run auth migration
await migrateAuthData();

// Create admin account on first launch
if (await getUserCount() === 0) {
  const password = crypto.randomUUID().slice(0, 16);
  const hash = await platform.hashPassword(password);
  const adminId = await createUser("admin", hash, "Admin", "local", undefined, true);
  migrateTrackedData(adminId);
  logger.info("Admin account created", { username: "admin" });
  console.log(`\n  Default admin password: ${password}\n  Change it after first login.\n`);
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

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  Sentry.captureException(err);
  return c.json({ error: "Internal server error" }, 500);
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

// Health check (public — used by Sentry uptime monitoring)
app.route("/api/health", healthRoutes);

// Prometheus metrics (public — protect via reverse proxy if needed)
app.route("/metrics", metricsRoutes);

// Rate limit auth routes: 20 requests per minute to prevent brute-force attacks
app.use("/api/auth/*", rateLimiter({ limit: 20, windowMs: 60_000 }));

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

// Social routes — follow/unfollow (auth), follower/following lists (public)
app.use("/api/social/follow/*", requireAuth);
app.use("/api/social/follow", requireAuth);
app.use("/api/social/followers/*", optionalAuth);
app.use("/api/social/followers", optionalAuth);
app.use("/api/social/following/*", optionalAuth);
app.use("/api/social/following", optionalAuth);
app.route("/api/social", socialRoutes);

// Ratings routes — optionalAuth base, POST/DELETE check auth internally
app.use("/api/ratings/*", optionalAuth);
app.use("/api/ratings", optionalAuth);
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

app.use("/api/user/settings/*", requireAuth);
app.route("/api/user/settings", userSettingsRoutes);

// Calendar feed — /calendar.ics is public (token-authenticated); /token endpoints require session
app.use("/api/feed/token*", requireAuth);
app.route("/api/feed", feedRoutes);

// Admin routes
app.use("/api/admin/*", requireAuth, requireAdmin);
app.use("/api/admin", requireAuth, requireAdmin);
app.route("/api/admin", adminRoutes);

app.use("/api/jobs/*", requireAuth, requireAdmin);
app.use("/api/jobs", requireAuth, requireAdmin);
app.route("/api/jobs", jobsRoutes);

// Detail pages (optionalAuth for is_tracked)
app.use("/api/details/*", optionalAuth);
app.use("/api/details", optionalAuth);
app.route("/api/details", detailsRoutes);

// Sync (admin only — rate limited + require admin)
app.use("/api/sync/*", rateLimiter({ limit: 5, windowMs: 60_000 }));
app.use("/api/sync", rateLimiter({ limit: 5, windowMs: 60_000 }));
app.use("/api/sync/*", requireAuth, requireAdmin);
app.use("/api/sync", requireAuth, requireAdmin);
app.route("/api/sync", syncRoutes);

// Episodes (optionalAuth for upcoming/status, requireAuth for sync)
app.use("/api/episodes/*", optionalAuth);
app.use("/api/episodes", optionalAuth);
app.route("/api/episodes", episodesRoutes);

// Serve frontend static files in production
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.use("/*", serveStatic({ root: "./frontend/dist", path: "/index.html" }));

// Start background job queue
setScheduleCallback(registerCron);
registerSyncJobs();
await registerNotificationJobs();
registerBackupJob();
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
