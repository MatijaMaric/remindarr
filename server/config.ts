export const CONFIG = {
  LOG_LEVEL: (process.env.LOG_LEVEL || "info") as
    | "debug"
    | "info"
    | "warn"
    | "error",
  COUNTRY: process.env.TMDB_COUNTRY || "HR",
  FALLBACK_COUNTRIES: (process.env.TMDB_FALLBACK_COUNTRIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  LANGUAGE: process.env.TMDB_LANGUAGE || "en",
  DEFAULT_DAYS_BACK: 30,
  PAGE_SIZE: 20,
  PAGE_DELAY_MS: 300,
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || "./remindarr.db",
  TMDB_API_KEY: process.env.TMDB_API_KEY || "",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  TMDB_IMAGE_BASE_URL: "https://image.tmdb.org/t/p",
  TMDB_API_TIMEOUT_MS: Number(process.env.TMDB_API_TIMEOUT_MS) || 15000,
  EPISODE_SYNC_DELAY_MS: 500,
  SYNC_TITLES_CRON: process.env.SYNC_TITLES_CRON || "0 3 * * *",
  SYNC_EPISODES_CRON: process.env.SYNC_EPISODES_CRON || "30 3 * * *",

  // Auth
  SESSION_DURATION_HOURS: Number(process.env.SESSION_DURATION_HOURS) || 24 * 7,
  SESSION_COOKIE_NAME: "remindarr_session",

  // OIDC (env vars take precedence over DB settings)
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || "",
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || "",
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || "",
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || "",
  OIDC_ADMIN_CLAIM: process.env.OIDC_ADMIN_CLAIM || "",
  OIDC_ADMIN_VALUE: process.env.OIDC_ADMIN_VALUE || "",

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",

  // Sentry
  SENTRY_DSN: process.env.SENTRY_DSN || "",
};
