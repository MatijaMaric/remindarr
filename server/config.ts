export const CONFIG = {
  JUSTWATCH_GRAPHQL_URL: "https://apis.justwatch.com/graphql",
  COUNTRY: process.env.JUSTWATCH_COUNTRY || "HR",
  LANGUAGE: process.env.JUSTWATCH_LANGUAGE || "hr",
  LOCALE: process.env.JUSTWATCH_LOCALE || "hr_HR",
  DEFAULT_DAYS_BACK: 30,
  PAGE_SIZE: 40,
  PAGE_DELAY_MS: 1000,
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || "./jwsync.db",
  POSTER_BASE_URL: "https://images.justwatch.com/poster",
  ICON_BASE_URL: "https://images.justwatch.com/icon",
  TMDB_API_KEY: process.env.TMDB_API_KEY || "",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  EPISODE_SYNC_DELAY_MS: 500,

  // Auth
  SESSION_DURATION_HOURS: Number(process.env.SESSION_DURATION_HOURS) || 24 * 7,
  SESSION_COOKIE_NAME: "jwsync_session",

  // OIDC (env vars take precedence over DB settings)
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || "",
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || "",
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || "",
  OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || "",
};
