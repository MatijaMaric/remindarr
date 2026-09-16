/** Shared JSON replacer for application logs and Sentry's serialized events. */
export function redactTelemetryValue(key: string, value: unknown): unknown {
  if (
    /^(authorization|cookie|set-cookie|params|(?:access[_-]?|refresh[_-]?|auth|plex)?token|x-plex-token)$/i.test(
      key,
    )
  )
    return "[redacted]";
  if (typeof value !== "string") return value;
  return (
    value
      // Drizzle includes bound values in both its message and stack. Retain the
      // parameterized SQL and stack frames, but never export the parameter dump.
      .replace(/(\nparams: )[^\n]*/g, "$1[redacted]")
      .replace(
        /(\/(?:api\/)?(?:share\/(?:watchlist|wrapped)|kiosk)\/)(?!:)[^/?#\s"'<>]+/gi,
        "$1[redacted]",
      )
      .replace(
        /((?:^|[?&\s])(?:token|access_token|refresh_token|authToken|X-Plex-Token)=)[^&#\s"'<>]+/gi,
        "$1[redacted]",
      )
  );
}

/** Sentry also captures raw URLs outside the application request logger. */
export function redactTelemetry<T>(event: T): T {
  return JSON.parse(JSON.stringify(event, redactTelemetryValue));
}
