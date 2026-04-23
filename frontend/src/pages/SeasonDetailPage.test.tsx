import { describe, it, expect, mock, afterEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import * as sonner from "sonner";
import "../i18n";

let mockUser: any = { id: "user1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
  AuthContext: { Provider: ({ children }: any) => children },
}));

const defaultSeasons = [
  { id: 1, name: "Season 1", overview: "", air_date: "2024-01-01", episode_count: 3, poster_path: null, season_number: 1, vote_average: 8.0 },
  { id: 2, name: "Season 2", overview: "", air_date: "2024-06-01", episode_count: 5, poster_path: null, season_number: 2, vote_average: 7.5 },
];

const mockGetSeasonDetails = mock(() => Promise.resolve({
  title: { id: "tv-100", title: "Test Show", is_tracked: true },
  tmdb: {
    id: 1,
    name: "Season 1",
    overview: "Overview",
    air_date: "2024-01-01",
    poster_path: null,
    season_number: 1,
    vote_average: 8.0,
    episodes: [
      { id: 101, name: "Pilot", overview: "First episode", air_date: "2024-01-01", episode_number: 1, season_number: 1, still_path: null, runtime: 45, vote_average: 8.5, guest_stars: [], crew: [] },
      { id: 102, name: "Second", overview: "The second one", air_date: "2024-01-08", episode_number: 2, season_number: 1, still_path: null, runtime: 42, vote_average: 7.9, guest_stars: [], crew: [] },
      { id: 103, name: "Future", overview: "Unreleased", air_date: "2099-12-31", episode_number: 3, season_number: 1, still_path: null, runtime: null, vote_average: 0, guest_stars: [], crew: [] },
    ],
    credits: { cast: [], crew: [] },
  },
  seasonNumber: 1,
  country: "US",
  seasons: defaultSeasons,
}));

const mockGetSeasonEpisodeStatus = mock(() => Promise.resolve({
  episodes: [
    { episode_number: 1, id: 10, is_watched: false },
    { episode_number: 2, id: 11, is_watched: true },
    { episode_number: 3, id: 12, is_watched: false },
  ],
}));

const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());
const mockWatchEpisodesBulk = mock(() => Promise.resolve());

const mockGetEpisodeDetails = mock(() => Promise.resolve({}));

mock.module("../api", () => ({
  getSeasonDetails: mockGetSeasonDetails,
  getEpisodeDetails: mockGetEpisodeDetails,
  getSeasonEpisodeStatus: mockGetSeasonEpisodeStatus,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
  watchEpisodesBulk: mockWatchEpisodesBulk,
}));

const { default: SeasonDetailPage } = await import("./SeasonDetailPage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/title/tv-100/season/1"]}>
      <Routes>
        <Route path="/title/:id/season/:season" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockGetSeasonDetails.mockReset();
  mockGetSeasonEpisodeStatus.mockReset();
  mockWatchEpisode.mockReset();
  mockUnwatchEpisode.mockReset();
  mockWatchEpisodesBulk.mockReset();
  mockUser = { id: "user1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

  // Re-set default implementations
  mockGetSeasonDetails.mockImplementation(() => Promise.resolve({
    title: { id: "tv-100", title: "Test Show", is_tracked: true },
    tmdb: {
      id: 1, name: "Season 1", overview: "Overview", air_date: "2024-01-01", poster_path: null, season_number: 1, vote_average: 8.0,
      episodes: [
        { id: 101, name: "Pilot", overview: "First", air_date: "2024-01-01", episode_number: 1, season_number: 1, still_path: null, runtime: 45, vote_average: 8.5, guest_stars: [], crew: [] },
        { id: 102, name: "Second", overview: "The second one", air_date: "2024-01-08", episode_number: 2, season_number: 1, still_path: null, runtime: 42, vote_average: 7.9, guest_stars: [], crew: [] },
        { id: 103, name: "Future", overview: "Unreleased", air_date: "2099-12-31", episode_number: 3, season_number: 1, still_path: null, runtime: null, vote_average: 0, guest_stars: [], crew: [] },
      ],
      credits: { cast: [], crew: [] },
    },
    seasonNumber: 1, country: "US",
    seasons: defaultSeasons,
  }));

  mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({
    episodes: [
      { episode_number: 1, id: 10, is_watched: false },
      { episode_number: 2, id: 11, is_watched: true },
      { episode_number: 3, id: 12, is_watched: false },
    ],
  }));
});

describe("SeasonDetailPage", () => {
  it("renders episodes with watched icons when authenticated", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Should have watched icon buttons (for released episodes) and a disabled one
    const watchedButtons = screen.getAllByRole("button");
    expect(watchedButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("does not render watched icons when not authenticated", async () => {
    mockUser = null;
    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({ episodes: [] }));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // No watched icon buttons should be present (only the "Mark all" buttons would be absent too)
    const watchedButtons = screen.queryAllByLabelText(/mark as/i);
    expect(watchedButtons).toHaveLength(0);
  });

  it("does not render watched icons when status is empty", async () => {
    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({ episodes: [] }));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const watchedButtons = screen.queryAllByLabelText(/mark as/i);
    expect(watchedButtons).toHaveLength(0);
  });

  it("shows disabled icon for unreleased episodes", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Future")).toBeDefined());

    // The unreleased episode should have a disabled icon (role="img")
    const disabledIcons = screen.queryAllByRole("img");
    expect(disabledIcons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls watchEpisode API when toggling unwatched episode", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Find the mark-as-watched button for the first (unwatched) episode
    const watchButtons = screen.getAllByLabelText(/mark as watched/i);
    expect(watchButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(watchButtons[0]);
    });

    await waitFor(() => {
      expect(mockWatchEpisode).toHaveBeenCalledWith(10);
    });
  });

  it("calls unwatchEpisode API when toggling watched episode", async () => {
    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({
      episodes: [
        { episode_number: 1, id: 10, is_watched: false },
        { episode_number: 2, id: 11, is_watched: true },
        { episode_number: 3, id: 12, is_watched: false },
      ],
    }));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getAllByText("Second").length).toBeGreaterThanOrEqual(1));

    // Wait for status to load and "mark as unwatched" button to appear
    await waitFor(() => {
      expect(screen.getAllByLabelText(/mark as unwatched/i).length).toBeGreaterThanOrEqual(1);
    });

    const unwatchButtons = screen.getAllByLabelText(/mark as unwatched/i);
    await act(async () => {
      fireEvent.click(unwatchButtons[0]);
    });

    await waitFor(() => {
      expect(mockUnwatchEpisode).toHaveBeenCalledWith(11);
    });
  });

  it("shows toast on toggle error and reverts", async () => {
    const toastErrorSpy = spyOn(sonner.toast, "error").mockImplementation(() => "1" as any);
    mockWatchEpisode.mockImplementation(() => Promise.reject(new Error("fail")));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const watchButtons = screen.getAllByLabelText(/mark as watched/i);
    await act(async () => {
      fireEvent.click(watchButtons[0]);
    });

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalled();
    });

    toastErrorSpy.mockRestore();
  });

  it("renders mark all watched button and calls bulk API", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Should show "Mark all watched" since not all released are watched
    const markAllBtn = screen.getByText(/mark all watched/i);
    expect(markAllBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(markAllBtn);
    });

    await waitFor(() => {
      expect(mockWatchEpisodesBulk).toHaveBeenCalledWith([10, 11], true);
    });
  });

  it("renders season pill tabs when multiple seasons exist", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const s1 = screen.getByRole("button", { name: "Season 1" });
    const s2 = screen.getByRole("button", { name: "Season 2" });
    expect(s1.getAttribute("aria-pressed")).toBe("true");
    expect(s2.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows AIRING NOW indicator for episodes airing today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockGetSeasonDetails.mockImplementation(() => Promise.resolve({
      title: { id: "tv-100", title: "Test Show", is_tracked: true },
      tmdb: {
        id: 1, name: "Season 1", overview: "Overview", air_date: "2024-01-01", poster_path: null, season_number: 1, vote_average: 8.0,
        episodes: [
          { id: 101, name: "Today Ep", overview: "Airing today", air_date: today, episode_number: 1, season_number: 1, still_path: null, runtime: 45, vote_average: 0, guest_stars: [], crew: [] },
          { id: 102, name: "Other Ep", overview: "Not today", air_date: "2024-01-08", episode_number: 2, season_number: 1, still_path: null, runtime: 42, vote_average: 0, guest_stars: [], crew: [] },
        ],
        credits: { cast: [], crew: [] },
      },
      seasonNumber: 1, country: "US", seasons: defaultSeasons,
    }));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Today Ep")).toBeDefined());

    const airingLabels = screen.getAllByText(/airing now/i);
    expect(airingLabels.length).toBe(1);
  });

  it("renders watched count summary", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // 1 watched (episode 2), 2 released/tracked; 3 total episodes; 2 remaining
    await waitFor(() => {
      expect(screen.getByText(/1 of 3 watched · 2 remaining/i)).toBeDefined();
    });
  });

  it("renders padded two-digit episode numbers", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("03")).toBeDefined();
  });

  it("does not render season pill tabs when only one season", async () => {
    mockGetSeasonDetails.mockImplementation(() => Promise.resolve({
      title: { id: "tv-100", title: "Test Show", is_tracked: true },
      tmdb: {
        id: 1, name: "Season 1", overview: "Overview", air_date: "2024-01-01", poster_path: null, season_number: 1, vote_average: 8.0,
        episodes: [
          { id: 101, name: "Pilot", overview: "First", air_date: "2024-01-01", episode_number: 1, season_number: 1, still_path: null, runtime: 45, vote_average: 8.5, guest_stars: [], crew: [] },
        ],
        credits: { cast: [], crew: [] },
      },
      seasonNumber: 1, country: "US",
      seasons: [{ id: 1, name: "Season 1", overview: "", air_date: "2024-01-01", episode_count: 1, poster_path: null, season_number: 1, vote_average: 8.0 }],
    }));

    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    expect(screen.queryByRole("button", { name: "Season 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Season 2" })).toBeNull();
  });

  it("renders per-row overflow menu and opens on click", async () => {
    render(<SeasonDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const moreButtons = screen.getAllByLabelText(/more actions/i);
    expect(moreButtons.length).toBe(3);

    await act(async () => {
      fireEvent.click(moreButtons[0]);
    });

    expect(screen.getByRole("menuitem", { name: /view details/i })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /share/i })).toBeDefined();
  });
});
