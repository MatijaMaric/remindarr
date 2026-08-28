/** Per-user content advisory level. `none` is the default (no filtering). */
export const ADVISORY_LEVELS = ["none", "mild", "moderate", "strict"] as const;
export type AdvisoryLevel = (typeof ADVISORY_LEVELS)[number];

export type AdvisoryAction = "show" | "blur" | "hide";

export interface AdvisorySettings {
  level: AdvisoryLevel;
  allowlist: readonly string[];
}

export const DEFAULT_ADVISORY_SETTINGS: AdvisorySettings = {
  level: "none",
  allowlist: [],
};

/**
 * TMDB certification → maturity rank.
 * Higher = more restricted. Returns null when the rating is missing or unknown
 * so unrated titles are never hidden (the catalog is full of them).
 *
 *   0  G / TV-Y / TV-G / U
 *   1  PG / TV-PG
 *   2  PG-13 / TV-14
 *   3  R / TV-MA
 *   4  NC-17 / 18+ / adult
 */
const RANK: Record<string, number> = {
  G: 0,
  "TV-Y": 0,
  "TV-Y7": 0,
  "TV-Y7-FV": 0,
  "TV-G": 0,
  U: 0,
  ALL: 0,
  AL: 0,
  "0": 0,
  PG: 1,
  "TV-PG": 1,
  "6": 1,
  "7": 1,
  "PG-12": 1,
  "PG-13": 2,
  "TV-14": 2,
  "12": 2,
  "12A": 2,
  "13": 2,
  "14": 2,
  M: 2,
  R: 3,
  "TV-MA": 3,
  "15": 3,
  "16": 3,
  "17": 3,
  "MA15+": 3,
  "MA-15": 3,
  "NC-17": 4,
  NC17: 4,
  "18": 4,
  "18+": 4,
  R18: 4,
  "R18+": 4,
  X: 4,
  XXX: 4,
  AO: 4,
  ADULT: 4,
};

export function certificationRank(
  certification: string | null | undefined,
): number | null {
  if (!certification) return null;
  const key = certification.trim().toUpperCase();
  if (!key) return null;
  return RANK[key] ?? null;
}

/**
 * Decide whether a title should be shown, blurred (warned), or hidden
 * for the given user settings. Allowlisted titles always show.
 * Unrated titles always show — we only act on known TMDB certifications.
 */
export function advisoryAction(
  certification: string | null | undefined,
  titleId: string | undefined,
  settings: AdvisorySettings,
): AdvisoryAction {
  if (settings.level === "none") return "show";
  if (titleId && settings.allowlist.includes(titleId)) return "show";
  const rank = certificationRank(certification);
  if (rank === null) return "show";
  if (settings.level === "mild") return rank >= 3 ? "blur" : "show";
  if (settings.level === "moderate") return rank >= 3 ? "hide" : "show";
  return rank >= 2 ? "hide" : "show";
}

export function parseAdvisoryLevel(value: unknown): AdvisoryLevel {
  if (
    typeof value === "string" &&
    (ADVISORY_LEVELS as readonly string[]).includes(value)
  ) {
    return value as AdvisoryLevel;
  }
  return "none";
}

export function parseAllowlist(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (id): id is string => typeof id === "string" && id !== "",
    );
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (id): id is string => typeof id === "string" && id !== "",
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}
