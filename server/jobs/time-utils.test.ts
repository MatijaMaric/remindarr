import { describe, it, expect } from "bun:test";
import { getCurrentTimeInTimezone } from "./time-utils";

describe("getCurrentTimeInTimezone", () => {
  it("returns time as HH:mm and date as YYYY-MM-DD", () => {
    const result = getCurrentTimeInTimezone("UTC");
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the exact UTC clock time for a known instant", () => {
    // 2024-01-15T12:34:56Z — UTC has no offset, so result must match.
    const fixed = new Date("2024-01-15T12:34:56Z");
    const result = getCurrentTimeInTimezone("UTC", fixed);
    expect(result.time).toBe("12:34");
    expect(result.date).toBe("2024-01-15");
  });

  it("applies a known fixed offset for Asia/Tokyo (UTC+9)", () => {
    // 2024-01-15T00:00:00Z → Tokyo is 09:00 same day
    const fixed = new Date("2024-01-15T00:00:00Z");
    const result = getCurrentTimeInTimezone("Asia/Tokyo", fixed);
    expect(result.time).toBe("09:00");
    expect(result.date).toBe("2024-01-15");
  });

  it("rolls the date forward when the timezone is ahead of UTC midnight", () => {
    // 2024-01-15T23:30:00Z → Tokyo is 08:30 on 2024-01-16
    const fixed = new Date("2024-01-15T23:30:00Z");
    const result = getCurrentTimeInTimezone("Asia/Tokyo", fixed);
    expect(result.time).toBe("08:30");
    expect(result.date).toBe("2024-01-16");
  });

  it("returns the correct offset for America/New_York while DST is active (EDT, UTC-4)", () => {
    // 2024-07-01T16:00:00Z is mid-summer, EDT is UTC-4 → 12:00 local
    const fixed = new Date("2024-07-01T16:00:00Z");
    const result = getCurrentTimeInTimezone("America/New_York", fixed);
    expect(result.time).toBe("12:00");
    expect(result.date).toBe("2024-07-01");
  });

  it("returns the correct offset for America/New_York while DST is inactive (EST, UTC-5)", () => {
    // 2024-01-15T17:00:00Z is mid-winter, EST is UTC-5 → 12:00 local
    const fixed = new Date("2024-01-15T17:00:00Z");
    const result = getCurrentTimeInTimezone("America/New_York", fixed);
    expect(result.time).toBe("12:00");
    expect(result.date).toBe("2024-01-15");
  });

  it("crosses the spring-forward DST boundary correctly", () => {
    // 2024-03-10 02:00 EST → 03:00 EDT (US spring forward).
    // 2024-03-10T07:30:00Z: pre-transition would have been 02:30 EST, but
    // the actual local time after spring-forward is 03:30 EDT.
    const fixed = new Date("2024-03-10T07:30:00Z");
    const result = getCurrentTimeInTimezone("America/New_York", fixed);
    expect(result.time).toBe("03:30");
    expect(result.date).toBe("2024-03-10");
  });

  it("falls back to UTC for an invalid timezone instead of throwing", () => {
    const fixed = new Date("2024-01-15T12:34:56Z");
    const utc = getCurrentTimeInTimezone("UTC", fixed);
    let result: { time: string; date: string } | undefined;
    expect(() => {
      result = getCurrentTimeInTimezone("Not/Real", fixed);
    }).not.toThrow();
    expect(result).toEqual(utc);
  });

  it("falls back to UTC for an empty-string timezone", () => {
    const fixed = new Date("2024-01-15T12:34:56Z");
    const utc = getCurrentTimeInTimezone("UTC", fixed);
    expect(getCurrentTimeInTimezone("", fixed)).toEqual(utc);
  });
});
