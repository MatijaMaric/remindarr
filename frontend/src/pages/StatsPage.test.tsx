import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import type { StatsResponse } from "../types";

const baseStats: StatsResponse = {
  overview: {
    tracked_movies: 5,
    tracked_shows: 10,
    watched_movies: 3,
    watched_episodes: 50,
    watch_time_minutes: 3000,
    watch_time_minutes_movies: 360,
    watch_time_minutes_shows: 2640,
  },
  genres: [],
  languages: [],
  monthly: [],
  shows_by_status: {
    watching: 0,
    caught_up: 0,
    completed: 0,
    not_started: 0,
    unreleased: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
  },
};

const mockGetStats = mock(() => Promise.resolve(baseStats));

mock.module("../api", () => ({
  getStats: mockGetStats,
}));

const { default: StatsPage, formatEta } = await import("./StatsPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockGetStats.mockReset();
  mockGetStats.mockImplementation(() => Promise.resolve(baseStats));
});

describe("StatsPage", () => {
  it("renders the Watchlist ETA tile with dash when pace is undefined", async () => {
    render(<StatsPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Watchlist ETA")).toBeDefined();
    });
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders the Watchlist ETA tile with dash when pace.watchlistEtaDays is null", async () => {
    mockGetStats.mockImplementation(() =>
      Promise.resolve({
        ...baseStats,
        pace: { minutesPerDay: null, watchlistEtaDays: null },
      })
    );
    render(<StatsPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Watchlist ETA")).toBeDefined();
    });
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders the Watchlist ETA tile with days value when pace is set", async () => {
    mockGetStats.mockImplementation(() =>
      Promise.resolve({
        ...baseStats,
        pace: { minutesPerDay: 60, watchlistEtaDays: 5 },
      })
    );
    render(<StatsPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("Watchlist ETA")).toBeDefined();
    });
    expect(screen.getByText("5d")).toBeDefined();
  });
});

describe("formatEta", () => {
  it("returns — for null", () => {
    expect(formatEta(null)).toBe("—");
  });

  it("returns '< 1 day' for 0 days", () => {
    expect(formatEta(0)).toBe("< 1 day");
  });

  it("returns days for < 7", () => {
    expect(formatEta(3)).toBe("3d");
    expect(formatEta(6)).toBe("6d");
  });

  it("returns weeks for 7–29 days", () => {
    expect(formatEta(7)).toBe("~1w");
    expect(formatEta(14)).toBe("~2w");
    expect(formatEta(21)).toBe("~3w");
  });

  it("returns months for 30+ days", () => {
    expect(formatEta(30)).toBe("~1mo");
    expect(formatEta(90)).toBe("~3mo");
  });
});
