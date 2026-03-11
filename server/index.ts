import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { CONFIG } from "./config";
import { getDb, migrateTrackedData } from "./db/schema";
import { getUserCount, createUser, deleteExpiredSessions } from "./db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./middleware/auth";
import syncRoutes from "./routes/sync";
import titlesRoutes from "./routes/titles";
import searchRoutes from "./routes/search";
import trackRoutes from "./routes/track";
import imdbRoutes from "./routes/imdb";
import calendarRoutes from "./routes/calendar";
import episodesRoutes from "./routes/episodes";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import type { AppEnv } from "./types";

// Initialize DB on startup
getDb();

// Create admin account on first launch
if (getUserCount() === 0) {
  const password = crypto.randomUUID().slice(0, 16);
  const hash = await Bun.password.hash(password);
  const adminId = createUser("admin", hash, "Admin", "local", undefined, true);
  migrateTrackedData(adminId);
  console.log("=".repeat(50));
  console.log("  Admin account created:");
  console.log(`  Username: admin`);
  console.log(`  Password: ${password}`);
  console.log("=".repeat(50));
}

const app = new Hono<AppEnv>();

// CORS for dev
app.use("/api/*", cors());

// Auth routes (public)
app.route("/api/auth", authRoutes);

// Public API routes (optionalAuth for is_tracked)
app.use("/api/titles/*", optionalAuth);
app.use("/api/titles", optionalAuth);
app.route("/api/titles", titlesRoutes);

app.use("/api/search/*", optionalAuth);
app.use("/api/search", optionalAuth);
app.route("/api/search", searchRoutes);

app.use("/api/calendar/*", optionalAuth);
app.use("/api/calendar", optionalAuth);
app.route("/api/calendar", calendarRoutes);

// Protected routes
app.use("/api/track/*", requireAuth);
app.use("/api/track", requireAuth);
app.route("/api/track", trackRoutes);

app.use("/api/imdb/*", requireAuth);
app.use("/api/imdb", requireAuth);
app.route("/api/imdb", imdbRoutes);

// Admin routes
app.use("/api/admin/*", requireAuth, requireAdmin);
app.use("/api/admin", requireAuth, requireAdmin);
app.route("/api/admin", adminRoutes);

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

console.log(`Remindarr server running on http://localhost:${CONFIG.PORT}`);

export default {
  port: CONFIG.PORT,
  fetch: app.fetch,
};
