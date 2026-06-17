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
  TMDB_API_TIMEOUT_MS: Number(process.env.TMDB_API_TIMEOUT_MS) || 5000,
  // Job worker per-handler deadline (Bun queue only). Must be < 30 min stale-job
  // recovery window so the in-process timeout fires before recoverStaleJobs could.
  JOB_HANDLER_TIMEOUT_MS: Number(process.env.JOB_HANDLER_TIMEOUT_MS) || 300000,
  EPISODE_SYNC_DELAY_MS: 500,
  SYNC_TITLES_CRON: process.env.SYNC_TITLES_CRON || "0 3 * * *",
  SYNC_EPISODES_CRON: process.env.SYNC_EPISODES_CRON || "30 3 * * *",

  // Trending (home screen)
  SYNC_TRENDING_CRON: process.env.SYNC_TRENDING_CRON || "0 5 * * *",
  TRENDING_TIME_WINDOW: (process.env.TRENDING_TIME_WINDOW || "week") as
    | "day"
    | "week",

  // Backup
  BACKUP_DIR: process.env.BACKUP_DIR || "",
  BACKUP_CRON: process.env.BACKUP_CRON || "0 2 * * *",
  BACKUP_RETAIN: Number(process.env.BACKUP_RETAIN) || 7,

  // Auth
  BASE_URL: process.env.BASE_URL || "",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",

  // Rate limit knob for /api/auth/* — keeps brute-force protection on by
  // default but lets e2e / CI raise the cap so test flows don't 429.
  AUTH_RATE_LIMIT_PER_MINUTE:
    Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE) || 20,
  // Global per-IP cap across all /api/* routes — guards against aggregate abuse.
  GLOBAL_RATE_LIMIT_PER_MINUTE:
    Number(process.env.GLOBAL_RATE_LIMIT_PER_MINUTE) || 300,

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

  // Streaming Availability API (deep links)
  STREAMING_AVAILABILITY_API_KEY:
    process.env.STREAMING_AVAILABILITY_API_KEY || "",
  SYNC_DEEP_LINKS_CRON: process.env.SYNC_DEEP_LINKS_CRON || "0 4 * * *",

  // Plex
  PLEX_CLIENT_ID: process.env.PLEX_CLIENT_ID || "remindarr-plex-client",
  SYNC_PLEX_CRON: process.env.SYNC_PLEX_CRON || "0 5 * * *",
  SYNC_PLEX_LIBRARY_CRON: process.env.SYNC_PLEX_LIBRARY_CRON || "0 6 * * *",

  // Sentry
  SENTRY_DSN: process.env.SENTRY_DSN || "",

  // Prometheus metrics bearer token. If set, /metrics requires
  // `Authorization: Bearer <token>`. If empty, /metrics is public
  // (intended for home-lab deploys behind a trusted reverse proxy).
  METRICS_TOKEN: process.env.METRICS_TOKEN || "",

  // Job queue backend (CF Workers only; Bun always uses queue.ts)
  JOB_QUEUE_BACKEND: (process.env.JOB_QUEUE_BACKEND || "d1") as
    | "d1"
    | "durable-object",

  // Cache
  CACHE_BACKEND: (process.env.CACHE_BACKEND || "memory") as
    | "memory"
    | "redis"
    | "kv",
  REDIS_URL: process.env.REDIS_URL || "",
  CACHE_TTL_GENRES: Number(process.env.CACHE_TTL_GENRES) || 86400,
  CACHE_TTL_PROVIDERS: Number(process.env.CACHE_TTL_PROVIDERS) || 86400,
  CACHE_TTL_LANGUAGES: Number(process.env.CACHE_TTL_LANGUAGES) || 86400,
  CACHE_TTL_SEARCH: Number(process.env.CACHE_TTL_SEARCH) || 300,
  CACHE_TTL_DETAILS: Number(process.env.CACHE_TTL_DETAILS) || 86400,
  CACHE_TTL_BROWSE: Number(process.env.CACHE_TTL_BROWSE) || 900,
  CACHE_TTL_FEED_ICS: Number(process.env.CACHE_TTL_FEED_ICS) || 300,
  CACHE_TTL_STREAMING: Number(process.env.CACHE_TTL_STREAMING) || 86400,
  CACHE_TTL_TRENDING: Number(process.env.CACHE_TTL_TRENDING) || 86400,
  CACHE_MAX_MEMORY_ENTRIES:
    Number(process.env.CACHE_MAX_MEMORY_ENTRIES) || 1000,
};

/**
 * Patch CONFIG at runtime.
 * Used by the CF Workers entry point to inject env bindings (secrets + vars)
 * that are not available via process.env.
 */
export function patchConfig(overrides: Partial<typeof CONFIG>): void {
  Object.assign(CONFIG, overrides);
}

/** CF Workers env bindings (secrets + vars) that map onto CONFIG. */
export interface CfConfigEnv {
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
  BETTER_AUTH_SECRET?: string;
  BASE_URL?: string;
  PASSKEY_RP_ID?: string;
  PASSKEY_RP_NAME?: string;
  PASSKEY_ORIGIN?: string;
  STREAMING_AVAILABILITY_API_KEY?: string;
  JOB_QUEUE_BACKEND?: string;
}

/**
 * Map CF Workers env bindings to a CONFIG override object. Pure — apply the
 * result with patchConfig().
 *
 * Shared by the Worker entry (server/worker.ts) AND the job Durable Object
 * (server/jobs/durable-object.ts). The DO runs in its own isolate where CONFIG
 * was never patched, so it must call this independently — otherwise job handlers
 * see empty secrets (e.g. TMDB_API_KEY) and skip all work (episodes/titles never
 * sync). Keep both call sites using this one function so the lists can't drift.
 */
export function cfEnvToConfigOverrides(
  env: CfConfigEnv,
): Partial<typeof CONFIG> {
  return {
    TMDB_API_KEY: env.TMDB_API_KEY || "",
    COUNTRY: env.TMDB_COUNTRY || undefined,
    LANGUAGE: env.TMDB_LANGUAGE || undefined,
    LOG_LEVEL:
      (env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || undefined,
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
    JOB_QUEUE_BACKEND:
      (env.JOB_QUEUE_BACKEND as "d1" | "durable-object") || "d1",
  };
}
