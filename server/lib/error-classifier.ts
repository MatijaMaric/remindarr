export type ErrorCategory = "db" | "external_api" | "auth" | "validation" | "unknown";

export function classifyError(err: unknown): ErrorCategory {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // DB errors: SQLite error codes, Drizzle error names, or messages containing "sqlite"
    const errCode = (err as unknown as { code?: unknown }).code;
    if (
      msg.includes("sqlite") ||
      err.constructor.name.includes("Sql") ||
      (typeof errCode === "string" && errCode.startsWith("SQLITE"))
    ) {
      return "db";
    }
    // External API: fetch failures or messages mentioning external services
    if (err.constructor.name === "TypeError" && msg.includes("fetch")) return "external_api";
    if (
      msg.includes("tmdb") ||
      msg.includes("plex") ||
      msg.includes("discord") ||
      msg.includes("telegram")
    ) {
      return "external_api";
    }
    // Auth errors
    if (
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("auth")
    ) {
      return "auth";
    }
    // Validation errors (zod, etc.)
    if (err.constructor.name === "ZodError" || msg.includes("validation")) return "validation";
  }
  return "unknown";
}
