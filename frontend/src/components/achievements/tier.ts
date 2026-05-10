export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

// Maps a 0-based rung index to a tier name + optional overflow suffix
export function tierFromRung(rungIndex: number): { tier: Tier; suffix?: string } {
  const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  if (rungIndex < TIERS.length) {
    return { tier: TIERS[rungIndex] };
  }
  // Diamond overflow: Diamond II, III, IV … capped at X
  const NUMERALS = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const overflow = rungIndex - TIERS.length + 1; // 1 for rungIndex=5, 2 for rungIndex=6, …
  return {
    tier: 'diamond',
    suffix: NUMERALS[Math.min(overflow, NUMERALS.length - 1)],
  };
}

// Tailwind classes for each tier — all use ring + bg + text tokens
export interface TierStyle {
  ring: string;  // e.g. "ring-2 ring-amber-700/40"
  bg: string;    // e.g. "bg-amber-900/10"
  text: string;  // e.g. "text-amber-700"
  icon: string;  // icon color class
}

export const TIER_COLORS: Record<Tier, TierStyle> = {
  bronze:   { ring: 'ring-2 ring-amber-700/40',  bg: 'bg-amber-900/10',   text: 'text-amber-600',  icon: 'text-amber-600' },
  silver:   { ring: 'ring-2 ring-zinc-300/40',   bg: 'bg-zinc-700/10',    text: 'text-zinc-300',   icon: 'text-zinc-300' },
  gold:     { ring: 'ring-2 ring-amber-400/50',  bg: 'bg-amber-400/10',   text: 'text-amber-400',  icon: 'text-amber-400' },
  platinum: { ring: 'ring-2 ring-sky-200/50',    bg: 'bg-sky-900/10',     text: 'text-sky-200',    icon: 'text-sky-200' },
  diamond:  { ring: 'ring-2 ring-cyan-300/50',   bg: 'bg-cyan-900/10',    text: 'text-cyan-300',   icon: 'text-cyan-300' },
};
