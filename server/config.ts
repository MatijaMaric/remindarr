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

  // Backup
  BACKUP_DIR: process.env.BACKUP_DIR || "",
  BACKUP_CRON: process.env.BACKUP_CRON || "0 2 * * *",
  BACKUP_RETAIN: Number(process.env.BACKUP_RETAIN) || 7,

  // Auth
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",

  // Passkeys (WebAuthn)
  PASSKEY_RP_ID: process.env.PASSKEY_RP_ID || "",
  PASSKEY_RP_NAME: process.env.PASSKEY_RP_NAME || "",
  PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN || "",

  // OIDC (env vars take precedence over DB settings)
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || "",
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || "",
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || "",
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || "",
  OIDC_ADMIN_CLAIM: process.env.OIDC_ADMIN_CLAIM || "",
  OIDC_ADMIN_VALUE: process.env.OIDC_ADMIN_VALUE || "",

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || "",
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || "",

  // Sentry
  SENTRY_DSN: process.env.SENTRY_DSN || "",
};

/**
 * Patch CONFIG at runtime.
 * Used by the CF Workers entry point to inject env bindings (secrets + vars)
 * that are not available via process.env.
 */
export function patchConfig(overrides: Partial<typeof CONFIG>): void {
  Object.assign(CONFIG, overrides);
}
