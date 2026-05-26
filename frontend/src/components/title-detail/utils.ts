export const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: "Premiere",
  2: "Theatrical (Limited)",
  3: "Theatrical",
  4: "Digital",
  5: "Physical",
  6: "TV",
};

export const MONETIZATION_ORDER = [
  { type: "FLATRATE", label: "Stream" },
  { type: "FREE", label: "Free" },
  { type: "ADS", label: "Ads" },
  { type: "RENT", label: "Rent" },
  { type: "BUY", label: "Buy" },
] as const;

export type MonetizationType = (typeof MONETIZATION_ORDER)[number]["type"];

export interface FormatDateOptions {
  withTime?: boolean;
  nullLabel?: string;
  utcAssumed?: boolean;
}

export function formatDate(
  dateStr: string | null | undefined,
  opts: FormatDateOptions = {},
): string {
  const { withTime = false, nullLabel = "—", utcAssumed = false } = opts;
  if (!dateStr) return nullLabel;
  let normalized = dateStr.includes("T") ? dateStr : dateStr + "T00:00:00";
  if (utcAssumed && !/(Z|[+-]\d{2}:?\d{2})$/.test(normalized))
    normalized += "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return nullLabel;
  const fmtOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return withTime
    ? d.toLocaleString(undefined, fmtOpts)
    : d.toLocaleDateString(undefined, fmtOpts);
}

export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatCurrency(value: number): string {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function getCertification(
  results: { iso_3166_1: string; rating: string }[] | undefined,
  country: string,
): string | null {
  if (!results) return null;
  const match =
    results.find((r) => r.iso_3166_1 === country) ||
    results.find((r) => r.iso_3166_1 === "US");
  return match?.rating || null;
}
