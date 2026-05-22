import { describe, test, expect } from "bun:test";
import { tierFromRung, TIER_COLORS } from "./tier";

describe("tierFromRung", () => {
  test("rungIndex=0 → bronze (no suffix)", () => {
    expect(tierFromRung(0)).toEqual({ tier: "bronze" });
  });

  test("rungIndex=1 → silver (no suffix)", () => {
    expect(tierFromRung(1)).toEqual({ tier: "silver" });
  });

  test("rungIndex=4 → diamond (no suffix)", () => {
    expect(tierFromRung(4)).toEqual({ tier: "diamond" });
  });

  test("rungIndex=5 → diamond II (overflow=1)", () => {
    expect(tierFromRung(5)).toEqual({ tier: "diamond", suffix: "II" });
  });

  test('rungIndex=8 → diamond V (overflow=4 → NUMERALS[4]="V")', () => {
    expect(tierFromRung(8)).toEqual({ tier: "diamond", suffix: "V" });
  });

  test('rungIndex=14 → diamond X (overflow=10 → capped at index 9 → NUMERALS[9]="X")', () => {
    expect(tierFromRung(14)).toEqual({ tier: "diamond", suffix: "X" });
  });

  test("rungIndex=100 → diamond X (capped)", () => {
    expect(tierFromRung(100)).toEqual({ tier: "diamond", suffix: "X" });
  });
});

describe("TIER_COLORS", () => {
  test("has all 5 tier keys", () => {
    const keys = Object.keys(TIER_COLORS);
    expect(keys).toContain("bronze");
    expect(keys).toContain("silver");
    expect(keys).toContain("gold");
    expect(keys).toContain("platinum");
    expect(keys).toContain("diamond");
    expect(keys).toHaveLength(5);
  });

  test("each tier has ring, bg, text, and icon properties", () => {
    const tiers = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
    for (const tier of tiers) {
      const style = TIER_COLORS[tier];
      expect(typeof style.ring).toBe("string");
      expect(typeof style.bg).toBe("string");
      expect(typeof style.text).toBe("string");
      expect(typeof style.icon).toBe("string");
    }
  });
});
