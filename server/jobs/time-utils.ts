/**
 * Returns the current time and date in the given IANA timezone.
 *
 * - `time` is `HH:mm` (24-hour, en-GB formatting).
 * - `date` is `YYYY-MM-DD` (ISO-style, en-CA formatting).
 *
 * Falls back to UTC if the timezone string is invalid, so callers
 * can rely on this function never throwing. The `now` parameter is
 * optional and exists primarily to make tests deterministic.
 */
export function getCurrentTimeInTimezone(
  tz: string,
  now: Date = new Date(),
): { time: string; date: string; dayOfWeek: number } {
  function dayOfWeekInTz(timezone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  }

  // Validate the timezone once; fall back to UTC if it is invalid so that
  // time, date, and dayOfWeek all use the same (valid) zone.
  let zone = "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    zone = tz;
  } catch {
    zone = "UTC";
  }

  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    time: timeFormatter.format(now),
    date: dateFormatter.format(now),
    dayOfWeek: dayOfWeekInTz(zone),
  };
}

/**
 * Exponential-backoff retry delay in seconds: `2^attempts × 30`.
 * Shared by the Bun queue, the portable processor, and the CF Durable Object.
 */
export function nextRetryDelaySec(attempts: number): number {
  return Math.pow(2, attempts) * 30;
}

/**
 * ISO-8601 timestamp `nextRetryDelaySec(attempts)` seconds from now.
 */
export function nextRetryAt(attempts: number): string {
  return new Date(
    Date.now() + nextRetryDelaySec(attempts) * 1000,
  ).toISOString();
}
