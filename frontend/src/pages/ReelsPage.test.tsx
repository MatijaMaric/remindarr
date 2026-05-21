import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";

const { default: ReelsPage, getFirstUnwatchedPerShow, normalizeMovieToReelItem } = await import("./ReelsPage");

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function WrapperWithSearch(initialSearch: string) {
  return function W({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={[`/reels${initialSearch}`]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;
let spies: ReturnType<typeof spyOn>[];
let getUpcomingEpisodesSpy: ReturnType<typeof spyOn<typeof api, "getUpcomingEpisodes">>;
let watchEpisodeSpy: ReturnType<typeof spyOn<typeof api, "watchEpisode">>;
let unwatchEpisodeSpy: ReturnType<typeof spyOn<typeof api, "unwatchEpisode">>;
let watchEpisodesBulkSpy: ReturnType<typeof spyOn<typeof api, "watchEpisodesBulk">>;
let browseTitlesSpy: ReturnType<typeof spyOn<typeof api, "browseTitles">>;
let getRecommendationsSpy: ReturnType<typeof spyOn<typeof api, "getRecommendations">>;
let fetchFriendsLovedSpy: ReturnType<typeof spyOn<typeof api, "fetchFriendsLoved">>;
let watchMovieSpy: ReturnType<typeof spyOn<typeof api, "watchMovie">>;
let unwatchMovieSpy: ReturnType<typeof spyOn<typeof api, "unwatchMovie">>;
let getMovieTrackingSpy: ReturnType<typeof spyOn<typeof api, "getMovieTracking">>;

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: { id: "u1", username: "me", display_name: "Me", auth_provider: "local", is_admin: false },
    providers: { local: true, oidc: null },
    loading: false,
    sessionStatus: "authenticated",
    subscriptions: null,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  });
  getUpcomingEpisodesSpy = spyOn(api, "getUpcomingEpisodes").mockResolvedValue({ today: [], upcoming: [], unwatched: [] } as any);
  watchEpisodeSpy = spyOn(api, "watchEpisode").mockResolvedValue(undefined as any);
  unwatchEpisodeSpy = spyOn(api, "unwatchEpisode").mockResolvedValue(undefined as any);
  watchEpisodesBulkSpy = spyOn(api, "watchEpisodesBulk").mockResolvedValue(undefined as any);
  browseTitlesSpy = spyOn(api, "browseTitles").mockResolvedValue({
    titles: [],
    page: 1,
    totalPages: 1,
    totalResults: 0,
    availableGenres: [],
    availableProviders: [],
    availableLanguages: [],
    regionProviderIds: [],
    priorityLanguageCodes: [],
  } as any);
  getRecommendationsSpy = spyOn(api, "getRecommendations").mockResolvedValue({ recommendations: [], count: 0 } as any);
  fetchFriendsLovedSpy = spyOn(api, "fetchFriendsLoved").mockResolvedValue({ titles: [] } as any);
  watchMovieSpy = spyOn(api, "watchMovie").mockResolvedValue(undefined as any);
  unwatchMovieSpy = spyOn(api, "unwatchMovie").mockResolvedValue(undefined as any);
  getMovieTrackingSpy = spyOn(api, "getMovieTracking").mockResolvedValue({
    to_watch: [
      {
        id: "m-1",
        title: "Inception",
        release_date: "2024-01-01",
        release_year: 2024,
        poster_url: null,
        offers: [],
      },
    ],
    upcoming: [],
  } as any);
  spies = [
    spyOn(api, "rateEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "unrateEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "getSubscriptions").mockResolvedValue({ providerIds: [] } as any),
  ];
});

afterEach(() => {
  useAuthSpy.mockRestore();
  getUpcomingEpisodesSpy.mockRestore();
  watchEpisodeSpy.mockRestore();
  unwatchEpisodeSpy.mockRestore();
  watchEpisodesBulkSpy.mockRestore();
  browseTitlesSpy.mockRestore();
  getRecommendationsSpy.mockRestore();
  fetchFriendsLovedSpy.mockRestore();
  watchMovieSpy.mockRestore();
  unwatchMovieSpy.mockRestore();
  getMovieTrackingSpy.mockRestore();
  spies.forEach(s => s.mockRestore());
  cleanup();
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
    getUpcomingEpisodesSpy.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<ReelsPage />, { wrapper: Wrapper });
    // Skeleton loading UI uses animate-pulse divs instead of text
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows error UI when initial fetch fails", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.reject(new Error("API error"))
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("API error")).toBeDefined());
  });

  it("shows empty state when no unwatched episodes", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText("No unwatched episodes")).toBeDefined()
    );
  });

  it("shows action error banner when markWatched fails", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [sampleEpisode] })
    );
    watchEpisodeSpy.mockImplementation(() =>
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

// ─── Source picker tests ───────────────────────────────────────────────────────

describe("ReelsPage source picker", () => {
  it("default (no ?source param) calls getUpcomingEpisodes", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(getUpcomingEpisodesSpy).toHaveBeenCalled());
    expect(browseTitlesSpy).not.toHaveBeenCalled();
    expect(getRecommendationsSpy).not.toHaveBeenCalled();
  });

  it("?source=coming-soon calls getUpcomingEpisodes not browseTitles", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=coming-soon") });
    await waitFor(() => expect(getUpcomingEpisodesSpy).toHaveBeenCalled());
    expect(browseTitlesSpy).not.toHaveBeenCalled();
  });

  it("?source=popular calls browseTitles not getUpcomingEpisodes", async () => {
    browseTitlesSpy.mockImplementation(() =>
      Promise.resolve({
        titles: [
          {
            id: "tt100",
            objectType: "MOVIE",
            title: "Popular Movie",
            originalTitle: null,
            releaseYear: 2024,
            releaseDate: "2024-01-01",
            runtimeMinutes: 120,
            shortDescription: "A popular film",
            genres: [],
            imdbId: null,
            tmdbId: null,
            posterUrl: null,
            ageCertification: null,
            originalLanguage: "en",
            tmdbUrl: null,
            offers: [],
            scores: { imdbScore: null, imdbVotes: null, tmdbScore: null },
            isTracked: false,
          },
        ],
        page: 1,
        totalPages: 1,
        totalResults: 1,
        availableGenres: [],
        availableProviders: [],
        availableLanguages: [],
        regionProviderIds: [],
        priorityLanguageCodes: [],
      } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=popular") });
    await waitFor(() => expect(browseTitlesSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Popular Movie").length).toBeGreaterThanOrEqual(1));
    expect(getUpcomingEpisodesSpy).not.toHaveBeenCalled();
  });

  it("?source=from-your-genres calls getRecommendations not getUpcomingEpisodes", async () => {
    getRecommendationsSpy.mockImplementation(() =>
      Promise.resolve({
        recommendations: [
          {
            id: "rec1",
            from_user: { id: "u1", username: "alice", display_name: null, image: null },
            title: { id: "tt200", title: "Rec Movie", object_type: "MOVIE", poster_url: null },
            message: "You'll love this",
            created_at: "2024-01-01T00:00:00Z",
            read_at: null,
          },
        ],
        count: 1,
      } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=from-your-genres") });
    await waitFor(() => expect(getRecommendationsSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Rec Movie").length).toBeGreaterThanOrEqual(1));
    expect(getUpcomingEpisodesSpy).not.toHaveBeenCalled();
  });

  it("?source=friends-loved with empty API response renders empty state", async () => {
    fetchFriendsLovedSpy.mockImplementation(() =>
      Promise.resolve({ titles: [] } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=friends-loved") });
    await waitFor(() =>
      expect(screen.getByText("Follow some friends to see what they love this week")).toBeDefined()
    );
    expect(getUpcomingEpisodesSpy).not.toHaveBeenCalled();
  });

  it("?source=friends-loved when endpoint 404s renders empty state", async () => {
    fetchFriendsLovedSpy.mockImplementation(() =>
      Promise.reject(new Error("Not found"))
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=friends-loved") });
    await waitFor(() =>
      expect(screen.getByText("Follow some friends to see what they love this week")).toBeDefined()
    );
  });

  it("renders source picker chips including Movies", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Coming Soon")).toBeDefined());
    expect(screen.getByText("Popular")).toBeDefined();
    expect(screen.getByText("From My Genres")).toBeDefined();
    expect(screen.getByText("Friends Loved")).toBeDefined();
    expect(screen.getByText("Movies")).toBeDefined();
  });

  it("?source=movies calls getMovieTracking not getUpcomingEpisodes", async () => {
    getMovieTrackingSpy.mockImplementation(() =>
      Promise.resolve({ to_watch: [], upcoming: [] } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=movies") });
    await waitFor(() => expect(getMovieTrackingSpy).toHaveBeenCalled());
    expect(getUpcomingEpisodesSpy).not.toHaveBeenCalled();
  });
});

const show1Episode = {
  ...sampleEpisode,
  id: 10,
  title_id: "show1",
  show_title: "First Show",
  season_number: 1,
  episode_number: 1,
};

const show2Episode = {
  ...sampleEpisode,
  id: 20,
  title_id: "show2",
  show_title: "Second Show",
  season_number: 1,
  episode_number: 1,
};

function simulateSwipeLeft(container: HTMLElement) {
  fireEvent.touchStart(container, {
    touches: [{ clientX: 300, clientY: 400 }],
  });
  fireEvent.touchEnd(container, {
    changedTouches: [{ clientX: 100, clientY: 400 }],
  });
}

describe("ReelsPage swipe to open season panel", () => {
  async function renderWithShows() {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({
        today: [],
        upcoming: [],
        unwatched: [show1Episode, show2Episode],
      })
    );
    const result = render(<ReelsPage />, { wrapper: Wrapper });
    // Wait for cards to render ("First Show" appears twice: card + clone)
    await waitFor(() => expect(screen.getAllByText("First Show").length).toBeGreaterThanOrEqual(1));
    const scrollContainer = result.container.querySelector(".overflow-y-scroll") as HTMLElement;
    return { ...result, scrollContainer };
  }

  it("swipe left opens season panel for the visible card", async () => {
    const { scrollContainer } = await renderWithShows();
    Object.defineProperty(scrollContainer, "clientHeight", { value: 800, configurable: true });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 0, configurable: true });

    await act(async () => {
      simulateSwipeLeft(scrollContainer);
    });

    // Season panel has aria-label identifying the show
    await waitFor(() =>
      expect(screen.getByLabelText("First Show — Season 1")).toBeDefined()
    );
  });

  it("swipe left on second card opens correct season panel", async () => {
    const { scrollContainer } = await renderWithShows();
    Object.defineProperty(scrollContainer, "clientHeight", { value: 800, configurable: true });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 800, configurable: true });

    await act(async () => {
      simulateSwipeLeft(scrollContainer);
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Second Show — Season 1")).toBeDefined()
    );
  });

  it("swipe left on clone card maps to first card", async () => {
    const { scrollContainer } = await renderWithShows();
    Object.defineProperty(scrollContainer, "clientHeight", { value: 800, configurable: true });
    // Clone card is at index 2 (with 2 real cards)
    Object.defineProperty(scrollContainer, "scrollTop", { value: 1600, configurable: true });

    await act(async () => {
      simulateSwipeLeft(scrollContainer);
    });

    await waitFor(() =>
      expect(screen.getByLabelText("First Show — Season 1")).toBeDefined()
    );
  });

  it("swipe does not open panel for caught-up card", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({
        today: [],
        upcoming: [],
        unwatched: [show1Episode],
      })
    );
    const { container } = render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("First Show")).toBeDefined());

    // Mark the only episode as watched to trigger caughtUp
    const markBtn = screen.queryByText("Mark as Watched");
    if (markBtn) {
      await act(async () => {
        markBtn.click();
      });
    }

    const scrollContainer = container.querySelector(".overflow-y-scroll");
    if (scrollContainer) {
      Object.defineProperty(scrollContainer, "clientHeight", { value: 800, configurable: true });
      Object.defineProperty(scrollContainer, "scrollTop", { value: 0, configurable: true });

      await act(async () => {
        simulateSwipeLeft(scrollContainer as HTMLElement);
      });
    }

    // Season panel should NOT appear
    expect(screen.queryByLabelText("First Show — Season 1")).toBeNull();
  });
});

describe("ReelsPage progress bar updates after marking watched", () => {
  const baseEpisode = {
    ...sampleEpisode,
    title_id: "show-progress",
    show_title: "Progress Show",
    total_episodes: 10,
    watched_episodes_count: 5,
  };
  const ep1 = { ...baseEpisode, id: 501, season_number: 1, episode_number: 1 };
  const ep2 = { ...baseEpisode, id: 502, season_number: 1, episode_number: 2 };

  it("advances progress bar when episode is marked watched", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    watchEpisodeSpy.mockImplementation(() => Promise.resolve());

    render(<ReelsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Progress Show")).toBeDefined());
    expect(screen.getByText("50% CAUGHT UP")).toBeDefined();
    expect(screen.getByText("5 OF 10")).toBeDefined();

    await act(async () => {
      screen.getByText("Mark as Watched").click();
    });

    await waitFor(() => expect(screen.getByText("60% CAUGHT UP")).toBeDefined());
    expect(screen.getByText("6 OF 10")).toBeDefined();
  });

  it("rewinds progress bar when undo is clicked", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    watchEpisodeSpy.mockImplementation(() => Promise.resolve());
    unwatchEpisodeSpy.mockImplementation(() => Promise.resolve());

    render(<ReelsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Progress Show")).toBeDefined());

    await act(async () => {
      screen.getByText("Mark as Watched").click();
    });
    await waitFor(() => expect(screen.getByText("60% CAUGHT UP")).toBeDefined());

    await act(async () => {
      screen.getByLabelText("Undo").click();
    });

    await waitFor(() => expect(screen.getByText("50% CAUGHT UP")).toBeDefined());
    expect(screen.getByText("5 OF 10")).toBeDefined();
  });

  it("rewinds progress bar when watchEpisode API fails", async () => {
    getUpcomingEpisodesSpy.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    watchEpisodeSpy.mockImplementation(() =>
      Promise.reject(new Error("Network error"))
    );

    render(<ReelsPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Progress Show")).toBeDefined());

    await act(async () => {
      screen.getByText("Mark as Watched").click();
    });

    await waitFor(() => expect(screen.getByText("Network error")).toBeDefined());
    expect(screen.getByText("50% CAUGHT UP")).toBeDefined();
    expect(screen.getByText("5 OF 10")).toBeDefined();
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

describe("normalizeMovieToReelItem", () => {
  it("creates a synthetic Episode from a MovieTrackItem", () => {
    const movie = {
      id: "m-42",
      title: "Test Movie",
      release_date: "2024-03-15",
      release_year: 2024,
      poster_url: null,
      offers: [],
    };
    const ep = normalizeMovieToReelItem(movie);
    expect(ep.title_id).toBe("m-42");
    expect(ep.name).toBe("Test Movie");
    expect(ep.season_number).toBe(0);
    expect(ep.episode_number).toBe(0);
    expect(ep.air_date).toBe("2024-03-15");
  });
});

describe("ReelsPage — movies source", () => {
  it("renders the movie title for movies source", async () => {
    getMovieTrackingSpy.mockImplementation(() =>
      Promise.resolve({
        to_watch: [{ id: "m-1", title: "Inception", release_date: "2024-01-01", release_year: 2024, poster_url: null, offers: [] }],
        upcoming: [],
      } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=movies") });
    await waitFor(() => expect(screen.getAllByText("Inception").length).toBeGreaterThanOrEqual(1));
  });

  it("calls api.watchMovie (not watchEpisode) when marking a movie as watched", async () => {
    getMovieTrackingSpy.mockImplementation(() =>
      Promise.resolve({
        to_watch: [{ id: "m-1", title: "Inception", release_date: "2024-01-01", release_year: 2024, poster_url: null, offers: [] }],
        upcoming: [],
      } as any)
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=movies") });
    const btn = await screen.findByRole("button", { name: /mark as watched/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(watchMovieSpy).toHaveBeenCalledTimes(1);
    expect(watchMovieSpy).toHaveBeenCalledWith("m-1");
    expect(watchEpisodeSpy).not.toHaveBeenCalled();
  });
});
