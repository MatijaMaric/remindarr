import "./instrument";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "hono/bun";
import { CONFIG } from "./config";
import { getDb, migrateTrackedData } from "./db/schema";
import { getUserCount, createUser, deleteExpiredSessions } from "./db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./middleware/auth";
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
import type { AppEnv } from "./types";
import * as Sentry from "@sentry/node";
import { logger, requestLogger } from "./logger";
import { registerSyncJobs } from "./jobs/sync";
import { registerNotificationJobs } from "./jobs/notifications";
import { startWorker, stopWorker } from "./jobs/worker";
import { initJobsSchema } from "./jobs/queue";

// Initialize DB on startup
getDb();

// Create admin account on first launch
if (getUserCount() === 0) {
  const password = crypto.randomUUID().slice(0, 16);
  const hash = await Bun.password.hash(password);
  const adminId = createUser("admin", hash, "Admin", "local", undefined, true);
  migrateTrackedData(adminId);
  logger.info("Admin account created", { username: "admin", password });
}

const app = new Hono<AppEnv>();

// Sentry error handler
app.onError((err, c) => {
  Sentry.captureException(err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: "Internal server error" }, 500);
});

// CORS for dev
app.use("/api/*", cors());

// Request logging
app.use("/api/*", requestLogger());

// Auth routes (public)
app.route("/api/auth", authRoutes);

// Public API routes (optionalAuth for is_tracked)
app.use("/api/titles/*", optionalAuth);
app.use("/api/titles", optionalAuth);
app.route("/api/titles", titlesRoutes);

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
app.route("/api/sync", syncRoutes);

// Episodes (optionalAuth for upcoming, sync is public)
app.use("/api/episodes/*", optionalAuth);
app.use("/api/episodes", optionalAuth);
app.route("/api/episodes", episodesRoutes);

// Serve frontend static files in production
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.use("/*", serveStatic({ root: "./frontend/dist", path: "/index.html" }));

// Clean expired sessions every hour
setInterval(() => {
  deleteExpiredSessions();
}, 60 * 60 * 1000);

// Start background job queue
initJobsSchema();
registerSyncJobs();
registerNotificationJobs();
startWorker();

process.on("SIGTERM", () => {
  stopWorker();
  process.exit(0);
});

logger.info("Server started", { port: CONFIG.PORT });

export default {
  port: CONFIG.PORT,
  fetch: app.fetch,
};
