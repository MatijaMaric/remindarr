import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

const mockGetUpcomingEpisodes = mock(() =>
  Promise.resolve({ today: [], upcoming: [], unwatched: [] })
);
const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());

mock.module("../api", () => ({
  getUpcomingEpisodes: mockGetUpcomingEpisodes,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
}));

const { default: UpcomingPage } = await import("./UpcomingPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mock.restore();
});

describe("UpcomingPage", () => {
  it("shows loading state initially", () => {
    mockGetUpcomingEpisodes.mockImplementation(() => new Promise(() => {}));
    render(<UpcomingPage />, { wrapper: Wrapper });
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("shows error UI when initial fetch fails", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.reject(new Error("Network error"))
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Network error")).toBeDefined());
  });

  it("renders today and upcoming sections on success", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<UpcomingPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Today")).toBeDefined());
  });

  it("shows action error when toggleWatched fails", async () => {
    const episode = {
      id: 1,
      title_id: "tt1",
      show_title: "Test Show",
      season_number: 1,
      episode_number: 1,
      name: "Pilot",
      air_date: null,
      poster_url: null,
      is_watched: false,
      offers: [],
    };
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [episode], upcoming: [], unwatched: [] })
    );
    mockWatchEpisode.mockImplementation(() =>
      Promise.reject(new Error("Failed to update"))
    );

    render(<UpcomingPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Test Show")).toBeDefined());

    // Click the watched icon to trigger toggleWatched
    const watchedButtons = screen.getAllByRole("button");
    const watchedIcon = watchedButtons.find((btn) =>
      btn.className.includes("text-gray") || btn.className.includes("cursor-pointer")
    );

    if (watchedIcon) {
      await act(async () => {
        fireEvent.click(watchedIcon);
      });
      await waitFor(() => expect(screen.getByText("Failed to update")).toBeDefined());
    }
  });
});
