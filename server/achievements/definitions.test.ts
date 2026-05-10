import { describe, it, expect } from "bun:test";
import { ACHIEVEMENTS, ACHIEVEMENT_META } from "./definitions";

describe("ACHIEVEMENTS registry", () => {
  it("has no duplicate keys", () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("every entry has non-empty title, description, and icon", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.icon.length).toBeGreaterThan(0);
    }
  });

  it("every genre_count entry (except genre_explorer) has a genre defined", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.kind === "genre_count" && a.key !== "genre_explorer") {
        expect(a.genre).toBeDefined();
        expect(typeof a.genre).toBe("string");
        expect((a.genre as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("genre_explorer uses the __any__ convention", () => {
    const explorer = ACHIEVEMENTS.find((a) => a.key === "genre_explorer");
    expect(explorer).toBeDefined();
    expect(explorer?.genre).toBe("__any__");
  });

  it("every speed_binge_season entry has windowHours defined", () => {
    for (const a of ACHIEVEMENTS) {
      if (a.kind === "speed_binge_season") {
        expect(a.windowHours).toBeDefined();
        expect(typeof a.windowHours).toBe("number");
        expect(a.windowHours as number).toBeGreaterThan(0);
      }
    }
  });

  it("all points and threshold values are positive integers", () => {
    for (const a of ACHIEVEMENTS) {
      expect(Number.isInteger(a.points)).toBe(true);
      expect(a.points).toBeGreaterThan(0);
      expect(Number.isInteger(a.threshold)).toBe(true);
      expect(a.threshold).toBeGreaterThan(0);
    }
  });

  it("all kinds are valid AchievementKind values", () => {
    const validKinds = new Set([
      "count_movies",
      "count_episodes",
      "streak_days",
      "genre_count",
      "completionist",
      "social_first_recommendation",
      "social_first_follow",
      "speed_binge_season",
      "monthly_count_repeatable",
      "weekend_warrior_repeatable",
    ]);
    for (const a of ACHIEVEMENTS) {
      expect(validKinds.has(a.kind)).toBe(true);
    }
  });

  it("monthly_centurion has repeatable: true in its meta", () => {
    const meta = ACHIEVEMENT_META.get("monthly_centurion");
    expect(meta).toBeDefined();
    expect(meta?.repeatable).toBe(true);
  });

  it("weekend_warrior has repeatable: true in its meta", () => {
    const meta = ACHIEVEMENT_META.get("weekend_warrior");
    expect(meta).toBeDefined();
    expect(meta?.repeatable).toBe(true);
  });

  it("monthly_centurion has category: 'habit' in its meta", () => {
    const meta = ACHIEVEMENT_META.get("monthly_centurion");
    expect(meta).toBeDefined();
    expect(meta?.category).toBe("habit");
  });

  it("ACHIEVEMENT_META has an entry for every achievement in ACHIEVEMENTS", () => {
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_META.has(a.key)).toBe(true);
    }
    expect(ACHIEVEMENT_META.size).toBe(ACHIEVEMENTS.length);
  });
});
