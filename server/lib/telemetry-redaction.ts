/** Sentry also captures raw URLs outside the application request logger. */
export function redactTelemetry<T>(event: T): T {
  return JSON.parse(
    JSON.stringify(event, (key, value: unknown) => {
      if (
        /^(authorization|cookie|set-cookie|(?:access[_-]?|refresh[_-]?|auth|plex)?token|x-plex-token)$/i.test(
          key,
        )
      )
        return "[redacted]";
      if (typeof value !== "string") return value;
      return value
        .replace(
          /(\/(?:api\/)?(?:share\/(?:watchlist|wrapped)|kiosk)\/)[^/?#\s"'<>]+/gi,
          "$1[redacted]",
        )
        .replace(
          /((?:^|[?&\s])(?:token|access_token|refresh_token|authToken|X-Plex-Token)=)[^&#\s"'<>]+/gi,
          "$1[redacted]",
        );
    }),
  );
}
