import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";
import { logger } from "./logger";

const log = logger.child({ module: "startup" });

function mask(value: string, visibleChars = 4): string {
  if (!value) return "(not set)";
  if (value.length <= visibleChars) return "****";
  return value.slice(0, visibleChars) + "****";
}

function checkDbWritable(dbPath: string): void {
  const dir = path.dirname(path.resolve(dbPath));
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    log.error("DB directory is not writable — database writes will fail", {
      dbPath,
      dir,
    });
    process.exit(1);
  }
}

function logActiveConfig(): void {
  log.info("Active configuration", {
    PORT: CONFIG.PORT,
    LOG_LEVEL: CONFIG.LOG_LEVEL,
    DB_PATH: CONFIG.DB_PATH,
    TMDB_API_KEY: mask(CONFIG.TMDB_API_KEY),
    TMDB_BASE_URL: CONFIG.TMDB_BASE_URL,
    TMDB_API_TIMEOUT_MS: CONFIG.TMDB_API_TIMEOUT_MS,
    COUNTRY: CONFIG.COUNTRY,
    FALLBACK_COUNTRIES: CONFIG.FALLBACK_COUNTRIES,
    LANGUAGE: CONFIG.LANGUAGE,
    SYNC_TITLES_CRON: CONFIG.SYNC_TITLES_CRON,
    SYNC_EPISODES_CRON: CONFIG.SYNC_EPISODES_CRON,
    BETTER_AUTH_SECRET: mask(CONFIG.BETTER_AUTH_SECRET),
    OIDC_ISSUER_URL: CONFIG.OIDC_ISSUER_URL || "(not set)",
    OIDC_CLIENT_ID: CONFIG.OIDC_CLIENT_ID || "(not set)",
    OIDC_CLIENT_SECRET: mask(CONFIG.OIDC_CLIENT_SECRET),
    OIDC_REDIRECT_URI: CONFIG.OIDC_REDIRECT_URI || "(not set)",
    CORS_ORIGIN: CONFIG.CORS_ORIGIN || "(not set)",
    VAPID_PUBLIC_KEY: mask(CONFIG.VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: mask(CONFIG.VAPID_PRIVATE_KEY),
    VAPID_SUBJECT: CONFIG.VAPID_SUBJECT || "(not set)",
    SENTRY_DSN: CONFIG.SENTRY_DSN ? "(set)" : "(not set)",
  });
}

export function validateStartup(): void {
  if (!CONFIG.TMDB_API_KEY) {
    log.error(
      "TMDB_API_KEY is not set — all TMDB requests will fail. Set the TMDB_API_KEY environment variable and restart.",
    );
    process.exit(1);
  }

  if (!CONFIG.BETTER_AUTH_SECRET) {
    log.warn(
      "BETTER_AUTH_SECRET is not set — sessions will be broken on server restart. Set the BETTER_AUTH_SECRET environment variable to a long random string.",
    );
  }

  checkDbWritable(CONFIG.DB_PATH);

  logActiveConfig();
}
