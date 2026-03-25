import { describe, expect, test, afterEach, setSystemTime } from "bun:test";
import { movieCharacterUsernames, getDailyPlaceholder } from "./movie-characters";

describe("movieCharacterUsernames", () => {
  test("has exactly 100 entries", () => {
    expect(movieCharacterUsernames).toHaveLength(100);
  });

  test("all entries are non-empty strings", () => {
    for (const name of movieCharacterUsernames) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("has no duplicates", () => {
    const unique = new Set(movieCharacterUsernames);
    expect(unique.size).toBe(movieCharacterUsernames.length);
  });
});

describe("getDailyPlaceholder", () => {
  afterEach(() => {
    setSystemTime();
  });

  test("returns a string from the list", () => {
    const result = getDailyPlaceholder();
    expect(movieCharacterUsernames).toContain(result);
  });

  test("returns the same value for the same day", () => {
    setSystemTime(new Date("2025-06-15T08:00:00Z"));
    const morning = getDailyPlaceholder();

    setSystemTime(new Date("2025-06-15T22:00:00Z"));
    const evening = getDailyPlaceholder();

    expect(morning).toBe(evening);
  });

  test("returns a different value for different days", () => {
    setSystemTime(new Date("2025-06-15T12:00:00Z"));
    const day1 = getDailyPlaceholder();

    setSystemTime(new Date("2025-06-16T12:00:00Z"));
    const day2 = getDailyPlaceholder();

    expect(day1).not.toBe(day2);
  });
});
