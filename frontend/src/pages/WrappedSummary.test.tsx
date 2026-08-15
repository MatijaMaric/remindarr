import { describe, it, expect } from "bun:test";
import { formatWatchHours } from "./WrappedSummary";

describe("formatWatchHours", () => {
  it("formats exact hours", () => {
    expect(formatWatchHours(0)).toBe("0h");
    expect(formatWatchHours(60)).toBe("1h");
    expect(formatWatchHours(600)).toBe("10h");
  });

  it("formats leftover minutes", () => {
    expect(formatWatchHours(45)).toBe("45m");
    expect(formatWatchHours(90)).toBe("1h 30m");
  });
});
