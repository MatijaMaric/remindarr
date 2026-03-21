import "./instrument";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { CONFIG } from "./config";
import { initBunDb, migrateTrackedData } from "./db/bun-db";
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
import healthRoutes from "./routes/health";
import type { AppEnv } from "./types";
import Sentry from "./sentry";
import { logger, requestLogger } from "./logger";
import { registerSyncJobs } from "./jobs/sync";
import { registerNotificationJobs } from "./jobs/notifications";
import { startWorker, stopWorker } from "./jobs/worker";
import { registerCron } from "./jobs/queue";
import { setScheduleCallback } from "./jobs/schedule";
import { BunPlatform } from "./platform/bun";
import { createAuthWithOidc, type BetterAuthInstance } from "./auth/better-auth";
import { migrateAuthData } from "./db/migrate-auth";

// Initialize DB on startup
initBunDb();

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

// better-auth handler (handles /api/auth/* — sign-in, sign-up, session, etc.)
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

// Custom auth routes (providers endpoint)
app.route("/api/auth/custom", authCustomRoutes);

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

// Detail pages (optionalAuth for is_tracked)
app.use("/api/details/*", optionalAuth);
app.use("/api/details", optionalAuth);
app.route("/api/details", detailsRoutes);

// Sync (public — typically triggered by cron)
app.use("/api/sync/*", rateLimiter({ limit: 5, windowMs: 60_000 }));
app.use("/api/sync", rateLimiter({ limit: 5, windowMs: 60_000 }));
app.route("/api/sync", syncRoutes);

// Episodes (optionalAuth for upcoming, sync is public)
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
startWorker();

process.on("SIGTERM", async () => {
  stopWorker();
  await Sentry.flush(2000);
  process.exit(0);
});

logger.info("Server started", { port: CONFIG.PORT });

export default {
  port: CONFIG.PORT,
  fetch: app.fetch,
};
