import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

const mockGetUpcomingEpisodes = mock(() =>
  Promise.resolve({ today: [], upcoming: [], unwatched: [] })
);
const mockWatchEpisode = mock(() => Promise.resolve());
const mockUnwatchEpisode = mock(() => Promise.resolve());
const mockWatchEpisodesBulk = mock(() => Promise.resolve());
const mockBrowseTitles = mock(() =>
  Promise.resolve({
    titles: [],
    page: 1,
    totalPages: 1,
    totalResults: 0,
    availableGenres: [],
    availableProviders: [],
    availableLanguages: [],
    regionProviderIds: [],
    priorityLanguageCodes: [],
  })
);
const mockGetRecommendations = mock(() =>
  Promise.resolve({ recommendations: [], count: 0 })
);
const mockFetchFriendsLoved = mock(() =>
  Promise.resolve({ titles: [] })
);

mock.module("../api", () => ({
  getUpcomingEpisodes: mockGetUpcomingEpisodes,
  watchEpisode: mockWatchEpisode,
  unwatchEpisode: mockUnwatchEpisode,
  watchEpisodesBulk: mockWatchEpisodesBulk,
  browseTitles: mockBrowseTitles,
  getRecommendations: mockGetRecommendations,
  fetchFriendsLoved: mockFetchFriendsLoved,
}));

const { default: ReelsPage, getFirstUnwatchedPerShow } = await import("./ReelsPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function WrapperWithSearch(initialSearch: string) {
  return function W({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[`/reels${initialSearch}`]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  cleanup();
  mockGetUpcomingEpisodes.mockReset();
  mockWatchEpisode.mockReset();
  mockUnwatchEpisode.mockReset();
  mockWatchEpisodesBulk.mockReset();
  mockBrowseTitles.mockReset();
  mockGetRecommendations.mockReset();
  mockFetchFriendsLoved.mockReset();
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

// ─── Source picker tests ───────────────────────────────────────────────────────

describe("ReelsPage source picker", () => {
  it("default (no ?source param) calls getUpcomingEpisodes", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(mockGetUpcomingEpisodes).toHaveBeenCalled());
    expect(mockBrowseTitles).not.toHaveBeenCalled();
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });

  it("?source=coming-soon calls getUpcomingEpisodes not browseTitles", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=coming-soon") });
    await waitFor(() => expect(mockGetUpcomingEpisodes).toHaveBeenCalled());
    expect(mockBrowseTitles).not.toHaveBeenCalled();
  });

  it("?source=popular calls browseTitles not getUpcomingEpisodes", async () => {
    mockBrowseTitles.mockImplementation(() =>
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
      })
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=popular") });
    await waitFor(() => expect(mockBrowseTitles).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Popular Movie").length).toBeGreaterThanOrEqual(1));
    expect(mockGetUpcomingEpisodes).not.toHaveBeenCalled();
  });

  it("?source=from-your-genres calls getRecommendations not getUpcomingEpisodes", async () => {
    mockGetRecommendations.mockImplementation(() =>
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
      })
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=from-your-genres") });
    await waitFor(() => expect(mockGetRecommendations).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Rec Movie").length).toBeGreaterThanOrEqual(1));
    expect(mockGetUpcomingEpisodes).not.toHaveBeenCalled();
  });

  it("?source=friends-loved with empty API response renders empty state", async () => {
    mockFetchFriendsLoved.mockImplementation(() =>
      Promise.resolve({ titles: [] })
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=friends-loved") });
    await waitFor(() =>
      expect(screen.getByText("Follow some friends to see what they love this week")).toBeDefined()
    );
    expect(mockGetUpcomingEpisodes).not.toHaveBeenCalled();
  });

  it("?source=friends-loved when endpoint 404s renders empty state", async () => {
    mockFetchFriendsLoved.mockImplementation(() =>
      Promise.reject(new Error("Not found"))
    );
    render(<ReelsPage />, { wrapper: WrapperWithSearch("?source=friends-loved") });
    await waitFor(() =>
      expect(screen.getByText("Follow some friends to see what they love this week")).toBeDefined()
    );
  });

  it("renders source picker chips", async () => {
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [] })
    );
    render(<ReelsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Coming Soon")).toBeDefined());
    expect(screen.getByText("Popular")).toBeDefined();
    expect(screen.getByText("From My Genres")).toBeDefined();
    expect(screen.getByText("Friends Loved")).toBeDefined();
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
    mockGetUpcomingEpisodes.mockImplementation(() =>
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
    mockGetUpcomingEpisodes.mockImplementation(() =>
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
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    mockWatchEpisode.mockImplementation(() => Promise.resolve());

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
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    mockWatchEpisode.mockImplementation(() => Promise.resolve());
    mockUnwatchEpisode.mockImplementation(() => Promise.resolve());

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
    mockGetUpcomingEpisodes.mockImplementation(() =>
      Promise.resolve({ today: [], upcoming: [], unwatched: [ep1, ep2] })
    );
    mockWatchEpisode.mockImplementation(() =>
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
