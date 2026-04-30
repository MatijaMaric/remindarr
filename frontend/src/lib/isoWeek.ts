/**
 * Returns an ISO 8601 week key in the format "GGGG-WNN" for a given date.
 *
 * ISO 8601 weeks: Monday is the first day of the week; week 01 is the week
 * containing the year's first Thursday (equivalently, the week containing
 * January 4th).
 */
export function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Convert Sunday (0) to 7 so Monday=1 … Sunday=7
  const day = d.getUTCDay() || 7;
  // Shift to nearest Thursday (ISO week reference day)
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
