import { describe, it, expect } from "bun:test";

/**
 * Tests for the formatDate function used across detail pages.
 * The function is inlined in each page file, so we replicate it here
 * to verify the fix for ISO 8601 timestamp handling.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

describe("formatDate", () => {
  it("formats YYYY-MM-DD date strings", () => {
    const result = formatDate("2024-11-01");
    expect(result).toBe("Nov 1, 2024");
  });

  it("formats full ISO 8601 timestamps from TMDB release_dates", () => {
    const result = formatDate("2024-11-01T00:00:00.000Z");
    expect(result).toInclude("2024");
    expect(result).toInclude("Nov");
  });

  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("returns dash for malformed date string", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});
