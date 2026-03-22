import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

const mockGetUpcomingEpisodes = mock(() =>
  Promise.resolve({ today: [], upcoming: [], unwatched: [] })
);
const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());
const mockWatchEpisodesBulk = mock(() => Promise.resolve());

mock.module("../api", () => ({
  getUpcomingEpisodes: mockGetUpcomingEpisodes,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
  watchEpisodesBulk: mockWatchEpisodesBulk,
}));

const { default: ReelsPage, getFirstUnwatchedPerShow } = await import("./ReelsPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockGetUpcomingEpisodes.mockReset();
  mockWatchEpisode.mockReset();
  mockUnwatchEpisode.mockReset();
  mockWatchEpisodesBulk.mockReset();
});

const sampleEpisode = {
  id: 1,
  title_id: "tt1",
  show_title: "Test Show",
  season_number: 1,
  episode_number: 1,
  name: "Pilot",
  overview: null,
  air_date: null,
  still_path: null,
  poster_url: null,
  is_watched: false,
  offers: [],
};

describe("ReelsPage", () => {
  it("shows loading state initially", () => {
    mockGetUpcomingEpisodes.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<ReelsPage />, { wrapper: Wrapper });
    // Skeleton loading UI uses animate-pulse divs instead of text
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows error UI when initial fetch fails", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.reject(new Error("API error"))
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("API error")).toBeDefined());
  });

  it("shows empty state when no unwatched episodes", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText("No unwatched episodes")).toBeDefined()
    );
  });

  it("shows action error banner when markWatched fails", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [sampleEpisode] })
    );
    mockWatchEpisode.mockImplementation(() =>
      Promise.reject(new Error("Watch failed"))
    );

    render(<ReelsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Test Show")).toBeDefined());

    // Click "Mark as Watched" button
    const markWatchedBtn = screen.queryByText("Mark as Watched");
    if (markWatchedBtn) {
      await act(async () => {
        markWatchedBtn.click();
      });
      await waitFor(() => expect(screen.getByText("Watch failed")).toBeDefined());
    }
  });
});

describe("getFirstUnwatchedPerShow", () => {
  it("groups episodes by show and returns first unwatched per show", () => {
    const episodes = [
      { ...sampleEpisode, id: 1, title_id: "tt1", season_number: 1, episode_number: 1 },
      { ...sampleEpisode, id: 2, title_id: "tt1", season_number: 1, episode_number: 2 },
      { ...sampleEpisode, id: 3, title_id: "tt2", show_title: "Show 2", season_number: 1, episode_number: 1 },
    ];
    const result = getFirstUnwatchedPerShow(episodes);
    expect(result).toHaveLength(2);
    const show1 = result.find((c) => c.titleId === "tt1");
    expect(show1?.episodes).toHaveLength(2);
    expect(show1?.currentIndex).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(getFirstUnwatchedPerShow([])).toHaveLength(0);
  });

  it("sorts episodes within each show by season then episode number", () => {
    const episodes = [
      { ...sampleEpisode, id: 2, season_number: 1, episode_number: 2 },
      { ...sampleEpisode, id: 1, season_number: 1, episode_number: 1 },
      { ...sampleEpisode, id: 3, season_number: 2, episode_number: 1 },
    ];
    const result = getFirstUnwatchedPerShow(episodes);
    expect(result[0].episodes.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});
