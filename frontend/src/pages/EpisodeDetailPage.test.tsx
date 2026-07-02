import {
  describe,
  it,
  expect,
  mock,
  afterEach,
  beforeEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiMock, resetApiMock } from "../test-utils/apiMock";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
import * as sonner from "sonner";
import "../i18n";

let mockUser: any = {
  id: "user1",
  username: "test",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    sessionStatus: "authenticated",
  }),
  AuthContext: { Provider: ({ children }: any) => children },
}));

// Default episode-detail + season-status shapes the page renders. Mirrors the
// rich defaults this file previously declared on its own `../api` mock.
const EPISODE_DETAILS_DEFAULT = {
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
};

function applyEpisodeApiDefaults() {
  apiMock.getEpisodeDetails.mockImplementation(() =>
    Promise.resolve(EPISODE_DETAILS_DEFAULT),
  );
  apiMock.getSeasonEpisodeStatus.mockImplementation(() =>
    Promise.resolve({
      episodes: [{ episode_number: 1, id: 10, is_watched: false }],
    }),
  );
  apiMock.getWatchHistory.mockImplementation(() =>
    Promise.resolve({ history: [], playCount: 0 }),
  );
}

const { default: EpisodeDetailPage } = await import("./EpisodeDetailPage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/title/tv-100/season/1/episode/1"]}>
        <Routes>
          <Route
            path="/title/:id/season/:season/episode/:episode"
            element={children}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  applyEpisodeApiDefaults();
});

afterEach(() => {
  cleanup();
  resetApiMock();
  mockUser = {
    id: "user1",
    username: "test",
    display_name: null,
    auth_provider: "local",
    is_admin: false,
  };
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
    apiMock.getSeasonEpisodeStatus.mockImplementation(() =>
      Promise.resolve({ episodes: [] }),
    );

    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    // Wait a tick for status fetch to complete
    await waitFor(() => {
      const watchBtn = screen.queryByLabelText(/mark as/i);
      expect(watchBtn).toBeNull();
    });
  });

  it("shows disabled icon for unreleased episode", async () => {
    apiMock.getEpisodeDetails.mockImplementation(() =>
      Promise.resolve({
        title: { id: "tv-100", title: "Test Show" },
        tmdb: {
          id: 103,
          name: "Future Episode",
          overview: "Not yet",
          air_date: "2099-12-31",
          episode_number: 3,
          season_number: 1,
          still_path: null,
          runtime: null,
          vote_average: 0,
          vote_count: 0,
          guest_stars: [],
          crew: [],
          credits: { cast: [], crew: [] },
        },
        seasonNumber: 1,
        episodeNumber: 3,
        country: "US",
      }),
    );

    apiMock.getSeasonEpisodeStatus.mockImplementation(() =>
      Promise.resolve({
        episodes: [{ episode_number: 3, id: 12, is_watched: false }],
      }),
    );

    const UnreleasedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={["/title/tv-100/season/1/episode/3"]}>
          <Routes>
            <Route
              path="/title/:id/season/:season/episode/:episode"
              element={children}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    render(<EpisodeDetailPage />, { wrapper: UnreleasedWrapper });

    await waitFor(() =>
      expect(screen.getByText("Future Episode")).toBeDefined(),
    );

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
      expect(apiMock.watchEpisode).toHaveBeenCalledWith(10);
    });
  });

  it("calls unwatchEpisode when toggling watched episode", async () => {
    apiMock.getSeasonEpisodeStatus.mockImplementation(() =>
      Promise.resolve({
        episodes: [{ episode_number: 1, id: 10, is_watched: true }],
      }),
    );

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
      expect(apiMock.unwatchEpisode).toHaveBeenCalledWith(10);
    });
  });

  it("renders breadcrumb as a nav landmark with aria-current on the last crumb (#1060)", async () => {
    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const nav = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(nav).toBeDefined();
    const current = screen.getByText("Episode 1");
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  it("renders watched date in the browser locale, not hardcoded en-US (#1061)", async () => {
    apiMock.getSeasonEpisodeStatus.mockImplementation(() =>
      Promise.resolve({
        episodes: [{ episode_number: 1, id: 10, is_watched: true }],
      }),
    );
    apiMock.getWatchHistory.mockImplementation(() =>
      Promise.resolve({
        history: [{ id: "wh1", watchedAt: "2026-06-28 14:30:00" }],
        playCount: 1,
      }),
    );

    render(<EpisodeDetailPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Pilot")).toBeDefined());

    const expected = new Date("2026-06-28T14:30:00Z").toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" },
    );
    await waitFor(() =>
      expect(screen.getByText(`Watched ${expected}`)).toBeDefined(),
    );
  });

  it("shows toast on toggle error and reverts", async () => {
    const toastErrorSpy = spyOn(sonner.toast, "error").mockImplementation(
      () => "1" as any,
    );
    apiMock.watchEpisode.mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

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
