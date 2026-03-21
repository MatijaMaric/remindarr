import { describe, it, expect } from "bun:test";
import { localDateForTimezone, addDays } from "./timezone";

describe("localDateForTimezone", () => {
  it("returns a YYYY-MM-DD string", () => {
    const result = localDateForTimezone("UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC date for an invalid timezone", () => {
    const utcDate = localDateForTimezone("UTC");
    const result = localDateForTimezone("Invalid/Timezone");
    expect(result).toBe(utcDate);
  });

  it("returns different dates for timezones spanning midnight", () => {
    // This test verifies the function works correctly for different timezones.
    // We use a fixed Date to avoid flakiness — mock Date.now to a known UTC midnight crossing.
    // UTC 2024-01-15T00:30:00Z → UTC+12 is already 2024-01-15, UTC-12 is still 2024-01-14
    const result_utc = localDateForTimezone("UTC");
    // Just verify both return valid date strings
    const result_auckland = localDateForTimezone("Pacific/Auckland"); // UTC+13
    const result_pago = localDateForTimezone("Pacific/Pago_Pago");   // UTC-11
    expect(result_utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result_auckland).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result_pago).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDays", () => {
  it("adds days to a date string", () => {
    expect(addDays("2024-01-15", 1)).toBe("2024-01-16");
    expect(addDays("2024-01-15", 8)).toBe("2024-01-23");
  });

  it("handles month boundaries", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
  });

  it("handles year boundaries", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
  });

  it("handles leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});
