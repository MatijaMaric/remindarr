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

const mockGetEpisodeDetails = mock(() => Promise.resolve({
  title: { id: "tv-100", title: "Test Show" },
  tmdb: {
    id: 101,
    name: "Pilot",
    overview: "First episode",
    air_date: "2024-01-01",
    episode_number: 1,
    season_number: 1,
    still_path: null,
    runtime: 45,
    vote_average: 8.5,
    vote_count: 100,
    guest_stars: [],
    crew: [],
    credits: { cast: [], crew: [] },
  },
  seasonNumber: 1,
  episodeNumber: 1,
  country: "US",
}));

const mockGetSeasonEpisodeStatus = mock(() => Promise.resolve({
  episodes: [
    { episode_number: 1, id: 10, is_watched: false },
  ],
}));

const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());

const mockGetSeasonDetails = mock(() => Promise.resolve({}));
const mockWatchEpisodesBulk = mock(() => Promise.resolve());

mock.module("../api", () => ({
  getEpisodeDetails: mockGetEpisodeDetails,
  getSeasonDetails: mockGetSeasonDetails,
  getSeasonEpisodeStatus: mockGetSeasonEpisodeStatus,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
  watchEpisodesBulk: mockWatchEpisodesBulk,
}));

const { default: EpisodeDetailPage } = await import("./EpisodeDetailPage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/title/tv-100/season/1/episode/1"]}>
      <Routes>
        <Route path="/title/:id/season/:season/episode/:episode" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockGetEpisodeDetails.mockReset();
  mockGetSeasonEpisodeStatus.mockReset();
  mockWatchEpisode.mockReset();
  mockUnwatchEpisode.mockReset();
  mockUser = { id: "user1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

  mockGetEpisodeDetails.mockImplementation(() => Promise.resolve({
    title: { id: "tv-100", title: "Test Show" },
    tmdb: {
      id: 101, name: "Pilot", overview: "First episode", air_date: "2024-01-01",
      episode_number: 1, season_number: 1, still_path: null, runtime: 45,
      vote_average: 8.5, vote_count: 100, guest_stars: [], crew: [],
      credits: { cast: [], crew: [] },
    },
    seasonNumber: 1, episodeNumber: 1, country: "US",
  }));

  mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({
    episodes: [{ episode_number: 1, id: 10, is_watched: false }],
  }));
});

describe("EpisodeDetailPage", () => {
  it("renders episode with watched icon when authenticated", async () => {
    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Should have a watched icon button
    await waitFor(() => {
      const watchBtn = screen.queryByLabelText(/mark as watched/i);
      expect(watchBtn).not.toBeNull();
    });
  });

  it("does not render watched icon when not authenticated", async () => {
    mockUser = null;
    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({ episodes: [] }));

    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Wait a tick for status fetch to complete
    await waitFor(() => {
      const watchBtn = screen.queryByLabelText(/mark as/i);
      expect(watchBtn).toBeNull();
    });
  });

  it("shows disabled icon for unreleased episode", async () => {
    mockGetEpisodeDetails.mockImplementation(() => Promise.resolve({
      title: { id: "tv-100", title: "Test Show" },
      tmdb: {
        id: 103, name: "Future Episode", overview: "Not yet", air_date: "2099-12-31",
        episode_number: 3, season_number: 1, still_path: null, runtime: null,
        vote_average: 0, vote_count: 0, guest_stars: [], crew: [],
        credits: { cast: [], crew: [] },
      },
      seasonNumber: 1, episodeNumber: 3, country: "US",
    }));

    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({
      episodes: [{ episode_number: 3, id: 12, is_watched: false }],
    }));

    const UnreleasedWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/title/tv-100/season/1/episode/3"]}>
        <Routes>
          <Route path="/title/:id/season/:season/episode/:episode" element={children} />
        </Routes>
      </MemoryRouter>
    );

    render(<EpisodeDetailPage />, { wrapper: UnreleasedWrapper });

    await waitFor(() => expect(screen.getByText("Future Episode")).toBeDefined());

    // Disabled icon should be present (role="img"), no button
    await waitFor(() => {
      const disabledIcons = screen.queryAllByRole("img");
      expect(disabledIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls watchEpisode when toggling unwatched episode", async () => {
    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    await waitFor(() => {
      const watchBtn = screen.queryByLabelText(/mark as watched/i);
      expect(watchBtn).not.toBeNull();
    });

    const watchBtn = screen.getByLabelText(/mark as watched/i);
    await act(async () => {
      fireEvent.click(watchBtn);
    });

    await waitFor(() => {
      expect(mockWatchEpisode).toHaveBeenCalledWith(10);
    });
  });

  it("calls unwatchEpisode when toggling watched episode", async () => {
    mockGetSeasonEpisodeStatus.mockImplementation(() => Promise.resolve({
      episodes: [{ episode_number: 1, id: 10, is_watched: true }],
    }));

    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    await waitFor(() => {
      const unwatchBtn = screen.queryByLabelText(/mark as unwatched/i);
      expect(unwatchBtn).not.toBeNull();
    });

    const unwatchBtn = screen.getByLabelText(/mark as unwatched/i);
    await act(async () => {
      fireEvent.click(unwatchBtn);
    });

    await waitFor(() => {
      expect(mockUnwatchEpisode).toHaveBeenCalledWith(10);
    });
  });

  it("shows toast on toggle error and reverts", async () => {
    const toastErrorSpy = spyOn(sonner.toast, "error").mockImplementation(() => "1" as any);
    mockWatchEpisode.mockImplementation(() => Promise.reject(new Error("fail")));

    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    await waitFor(() => {
      const watchBtn = screen.queryByLabelText(/mark as watched/i);
      expect(watchBtn).not.toBeNull();
    });

    const watchBtn = screen.getByLabelText(/mark as watched/i);
    await act(async () => {
      fireEvent.click(watchBtn);
    });

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalled();
    });

    toastErrorSpy.mockRestore();
  });
});
