import { describe, it, expect } from "bun:test";
import { formatDate } from "./utils";

describe("formatDate", () => {
  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("returns em-dash for malformed input", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats YYYY-MM-DD date strings", () => {
    const result = formatDate("2024-11-01");
    expect(result).toInclude("2024");
    expect(result).toInclude("1");
  });

  it("formats full ISO 8601 timestamps", () => {
    const result = formatDate("2024-11-01T00:00:00.000Z");
    expect(result).toInclude("2024");
  });

  it("respects nullLabel option", () => {
    expect(formatDate(null, { nullLabel: "Never" })).toBe("Never");
    expect(formatDate("bad", { nullLabel: "Never" })).toBe("Never");
  });

  it("includes time when withTime is true", () => {
    const result = formatDate("2024-11-01T14:30:00Z", { withTime: true });
    expect(result).toInclude("2024");
    expect(result).toMatch(/\d+:\d+/);
  });

  it("utcAssumed appends Z to naïve ISO strings", () => {
    const withUtc = formatDate("2024-11-01T00:00:00", { utcAssumed: true });
    const withoutUtc = formatDate("2024-11-01T00:00:00");
    expect(withUtc).toInclude("2024");
    expect(withoutUtc).toInclude("2024");
  });

  it("utcAssumed does not double-append Z when already present", () => {
    const result = formatDate("2024-11-01T00:00:00Z", { utcAssumed: true });
    expect(result).toInclude("2024");
  });
});
