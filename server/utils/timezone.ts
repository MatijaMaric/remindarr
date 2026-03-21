/**
 * Returns the current date in YYYY-MM-DD format for the given IANA timezone.
 * Falls back to UTC if the timezone string is invalid.
 */
export function localDateForTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Returns a new date string (YYYY-MM-DD) offset by the given number of days.
 */
export function addDays(dateStr: string, days: number): string {
  const dt = new Date(dateStr + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
