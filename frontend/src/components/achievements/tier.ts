export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

// Maps a 0-based rung index to a tier name + optional overflow suffix
export function tierFromRung(rungIndex: number): {
  tier: Tier;
  suffix?: string;
} {
  const TIERS: Tier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
  if (rungIndex < TIERS.length) {
    return { tier: TIERS[rungIndex] };
  }
  // Diamond overflow: Diamond II, III, IV … capped at X
  const NUMERALS = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const overflow = rungIndex - TIERS.length + 1; // 1 for rungIndex=5, 2 for rungIndex=6, …
  return {
    tier: "diamond",
    suffix: NUMERALS[Math.min(overflow, NUMERALS.length - 1)],
  };
}

// Tailwind classes for each tier — all use ring + bg + text tokens
export interface TierStyle {
  ring: string; // e.g. "ring-2 ring-primary-border"
  bg: string; // e.g. "bg-primary-soft"
  text: string; // e.g. "text-primary-text"
  icon: string; // icon color class
}

export const TIER_COLORS: Record<Tier, TierStyle> = {
  bronze: {
    ring: "ring-2 ring-primary-border",
    bg: "bg-primary-soft",
    text: "text-primary-text",
    icon: "text-primary-text",
  },
  silver: {
    ring: "ring-2 ring-ring",
    bg: "bg-muted-hover/10",
    text: "text-foreground-secondary",
    icon: "text-foreground-secondary",
  },
  gold: {
    ring: "ring-2 ring-primary-border",
    bg: "bg-primary-soft",
    text: "text-primary-text",
    icon: "text-primary-text",
  },
  platinum: {
    ring: "ring-2 ring-info/50",
    bg: "bg-info/10",
    text: "text-info",
    icon: "text-info",
  },
  diamond: {
    ring: "ring-2 ring-cyan-300/50",
    bg: "bg-cyan-900/10",
    text: "text-cyan-300",
    icon: "text-cyan-300",
  },
};
