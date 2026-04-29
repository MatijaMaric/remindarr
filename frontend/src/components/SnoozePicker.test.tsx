import { describe, it, expect, beforeAll, afterEach, mock } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "../i18n";

// Mock the api module before importing the component
const mockSetTitleSnooze = mock(async (_titleId: string, _until: string | null) => ({ success: true }));

mock.module("../api", () => ({
  setTitleSnooze: mockSetTitleSnooze,
  setRemindOnRelease: mock(async () => ({ success: true, scheduledFor: null })),
}));

// Import after mocking
const { default: SnoozePicker } = await import("./SnoozePicker");

beforeAll(() => {
  // Ensure mocks are clean
  mockSetTitleSnooze.mockClear();
});

afterEach(() => {
  cleanup();
  mockSetTitleSnooze.mockClear();
});

describe("SnoozePicker", () => {
  it("renders bell icon when not snoozed", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />);
    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders bell-off icon and shows snoozed state when snoozed", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    render(<SnoozePicker titleId="movie-123" snoozeUntil={futureDate} />);
    const btn = screen.getByRole("button", { name: /notifications snoozed/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens dropdown on click", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />);
    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: /snooze 1 day/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /snooze 1 week/i })).toBeTruthy();
  });

  it("calls setTitleSnooze with ~1 day from now when Snooze 1 day is clicked", async () => {
    const onSnoozed = mock(() => {});
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} onSnoozed={onSnoozed} />);

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    const oneDayOption = screen.getByRole("option", { name: /snooze 1 day/i });
    fireEvent.click(oneDayOption);

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSetTitleSnooze).toHaveBeenCalledTimes(1);
    const [titleId, until] = mockSetTitleSnooze.mock.calls[0] as [string, string | null];
    expect(titleId).toBe("movie-123");
    expect(until).not.toBeNull();

    // Should be approximately 1 day from now
    const diff = new Date(until!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(80000000); // > 22 hours
    expect(diff).toBeLessThan(90000000); // < 25 hours
  });

  it("calls setTitleSnooze(id, null) when Clear snooze is clicked", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const onSnoozed = mock(() => {});
    render(<SnoozePicker titleId="movie-123" snoozeUntil={futureDate} onSnoozed={onSnoozed} />);

    const btn = screen.getByRole("button", { name: /notifications snoozed/i });
    fireEvent.click(btn);

    const clearOption = screen.getByRole("option", { name: /clear snooze/i });
    fireEvent.click(clearOption);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockSetTitleSnooze).toHaveBeenCalledTimes(1);
    const [titleId, until] = mockSetTitleSnooze.mock.calls[0] as [string, string | null];
    expect(titleId).toBe("movie-123");
    expect(until).toBeNull();
  });

  it("shows 'Until release' option when releaseDate is provided", () => {
    const futureRelease = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} releaseDate={futureRelease} />);

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    expect(screen.getByRole("option", { name: /until release/i })).toBeTruthy();
  });

  it("does not show 'Clear snooze' when not snoozed", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />);

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    const options = screen.queryAllByRole("option");
    const clearOption = options.find((o) => o.textContent?.toLowerCase().includes("clear"));
    expect(clearOption).toBeUndefined();
  });
});
