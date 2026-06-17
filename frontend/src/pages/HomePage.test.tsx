import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import "../i18n";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// --- Mocks ---

let mockUser: any = null;
let mockAuthLoading = false;

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockAuthLoading,
    sessionStatus: "authenticated",
  }),
  AuthContext: { Provider: ({ children }: any) => children },
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: MockResizeObserver,
  writable: true,
  configurable: true,
});

// useIsMobile is controllable per-test; defaults to false (desktop layout).
let mockIsMobile = false;
mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

function makeSearchTitle(i: number) {
  return {
    id: `t${i}`,
    objectType: i % 2 === 0 ? "MOVIE" : "SHOW",
    title: `Title ${i}`,
    originalTitle: null,
    releaseYear: 2026,
    releaseDate: "2026-01-01",
    runtimeMinutes: 120,
    shortDescription: null,
    genres: [],
    imdbId: null,
    tmdbId: null,
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
    offers: [],
    scores: { imdbScore: null, imdbVotes: null, tmdbScore: 7 },
    isTracked: false,
  };
}

function makeRecommendation(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    from_user: {
      id: "sender1",
      username: "alice",
      name: "Alice",
      display_name: "Alice",
      image: null,
    },
    title: {
      id: `title-${id}`,
      title: `Rec Movie ${id}`,
      object_type: "MOVIE",
      poster_url: null,
    },
    message: null,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

// File-wide default impls that differ from the shared apiMock defaults.
function applyHomeDefaults() {
  apiMock.browseTitles.mockImplementation(() =>
    Promise.resolve({
      titles: Array.from({ length: 20 }, (_, i) => makeSearchTitle(i + 1)),
      count: 20,
      page: 1,
      totalPages: 1,
    }),
  );
  apiMock.getUpcomingEpisodes.mockImplementation(() =>
    Promise.resolve({ today: [], upcoming: [], unwatched: [] }),
  );
  apiMock.getRecommendations.mockImplementation(() =>
    Promise.resolve({ recommendations: [], count: 0 }),
  );
  apiMock.getHomepageLayout.mockImplementation(() =>
    Promise.resolve({
      homepage_layout: [
        { id: "trending", enabled: true },
        { id: "today", enabled: true },
        { id: "upcoming", enabled: true },
        { id: "unwatched", enabled: true },
        { id: "recommendations", enabled: true },
        { id: "friends_loved", enabled: true },
      ],
    }),
  );
  apiMock.getTrending.mockImplementation(() =>
    Promise.resolve({ movies: [], shows: [], people: [], refreshedAt: "" }),
  );
  apiMock.getUpNext.mockImplementation(() => Promise.resolve({ items: [] }));
  apiMock.getFriendsLoved.mockImplementation(() =>
    Promise.resolve({ items: [] }),
  );
  apiMock.getMovieTracking.mockImplementation(() =>
    Promise.resolve({ to_watch: [], upcoming: [] }),
  );
  apiMock.getMyStreak.mockImplementation(() => Promise.resolve(null));
  apiMock.getSuggestionsAggregate.mockImplementation(() =>
    Promise.resolve({ flat: [] }),
  );
}

beforeEach(() => {
  applyHomeDefaults();
});

const { default: HomePage } = await import("./HomePage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  mockUser = null;
  mockAuthLoading = false;
  mockIsMobile = false;
  resetApiMock();
});

describe("HomePage — unauthenticated landing", () => {
  it("renders hero section with CTA buttons", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText("Track movies & TV shows you love"),
      ).toBeDefined();
    });

    expect(
      screen.getByText(
        "Get notified about new episodes, track what you've watched, and discover what's streaming.",
      ),
    ).toBeDefined();

    const signInLink = screen.getByRole("link", { name: "Sign In" });
    expect(signInLink.getAttribute("href")).toBe("/login");

    const signUpLink = screen.getByRole("link", { name: "Create Account" });
    expect(signUpLink.getAttribute("href")).toBe("/signup");
  });

  it("fetches and displays popular titles", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title 1")).toBeDefined();
    });

    expect(apiMock.browseTitles).toHaveBeenCalledWith(
      { category: "popular", page: 1 },
      expect.any(AbortSignal),
    );
    expect(screen.getByText("Popular Right Now")).toBeDefined();
  });

  it("limits displayed titles to 12", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title 12")).toBeDefined();
    });

    // Title 13 should not be rendered (sliced to 12)
    expect(screen.queryByText("Title 13")).toBeNull();
  });

  it("renders hero even when API fails", async () => {
    apiMock.browseTitles.mockImplementationOnce(() =>
      Promise.reject(new Error("fail")),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText("Track movies & TV shows you love"),
      ).toBeDefined();
    });

    // No titles rendered but hero is still there
    expect(screen.queryByText("Title 1")).toBeNull();
  });

  it("shows Discover More link to /browse", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Discover More/)).toBeDefined();
    });

    const link = screen.getByText(/Discover More/).closest("a");
    expect(link?.getAttribute("href")).toBe("/browse");
  });

  it("does not show recommendations section when unauthenticated", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText("Track movies & TV shows you love"),
      ).toBeDefined();
    });

    expect(screen.queryByText("Recommended for You")).toBeNull();
    expect(apiMock.getRecommendations).not.toHaveBeenCalled();
  });
});

describe("HomePage — trending section", () => {
  function trendingMovie() {
    return {
      id: "movie-99",
      objectType: "MOVIE" as const,
      title: "Trending Pick",
      posterUrl: null,
      releaseDate: "2026-02-02",
      isTracked: false,
    };
  }

  it("shows the trending section to signed-out visitors", async () => {
    apiMock.getTrending.mockImplementation(() =>
      Promise.resolve({
        movies: [trendingMovie()],
        shows: [],
        people: [],
        refreshedAt: "2026-06-17T05:00:00.000Z",
      }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Trending Now")).toBeDefined();
    });
    expect(screen.getByText("Trending Pick")).toBeDefined();
  });

  it("shows the trending section to authenticated users via the home layout", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getTrending.mockImplementation(() =>
      Promise.resolve({
        movies: [],
        shows: [
          {
            id: "tv-77",
            objectType: "SHOW" as const,
            title: "Trending Series",
            posterUrl: null,
            releaseDate: null,
            isTracked: false,
          },
        ],
        people: [],
        refreshedAt: "2026-06-17T05:00:00.000Z",
      }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Trending Now")).toBeDefined();
    });
    expect(screen.getByText("Trending Series")).toBeDefined();
  });

  it("shows the trending section to authenticated users on a mobile viewport", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    mockIsMobile = true;
    apiMock.getTrending.mockImplementation(() =>
      Promise.resolve({
        movies: [trendingMovie()],
        shows: [],
        people: [],
        refreshedAt: "2026-06-17T05:00:00.000Z",
      }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Trending Now")).toBeDefined();
    });
    expect(screen.getByText("Trending Pick")).toBeDefined();
  });
});

describe("HomePage — authenticated recommendations", () => {
  it("shows recommendations section when recommendations exist", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", {
        from_user: {
          id: "s2",
          username: "bob",
          name: "Bob",
          display_name: "Bob",
          image: null,
        },
        title: {
          id: "title-r2",
          title: "Rec Movie r2",
          object_type: "SHOW",
          poster_url: null,
        },
      }),
    ];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Recommended for You")).toBeDefined();
    });

    expect(screen.getByText("Rec Movie r1")).toBeDefined();
    expect(screen.getByText("Rec Movie r2")).toBeDefined();
    expect(screen.getByText("from @alice")).toBeDefined();
    expect(screen.getByText("from @bob")).toBeDefined();
  });

  it("hides recommendations section when no recommendations", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Recommended for You")).toBeNull();
  });

  it("fetches recommendations with limit of 6", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(apiMock.getRecommendations).toHaveBeenCalledWith(
        6,
        undefined,
        expect.any(AbortSignal),
      );
    });
  });

  it("shows 'See all' link to /discovery", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    const recs = [makeRecommendation("r1")];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 1 }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Recommended for You")).toBeDefined();
    });

    // Multiple "See all" links may exist (e.g. today section also has one).
    // Find the specific link pointing to /discovery.
    const seeAllLinks = screen
      .getAllByText(/See all/)
      .map((el) => el.closest("a"));
    const discoveryLink = seeAllLinks.find(
      (a) => a?.getAttribute("href") === "/discovery",
    );
    expect(discoveryLink).toBeDefined();
  });

  it("links recommendation cards to title detail page", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    const recs = [makeRecommendation("r1")];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 1 }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Rec Movie r1")).toBeDefined();
    });

    // The card is a link to the title detail page
    const titleLink = screen.getByText("Rec Movie r1").closest("a");
    expect(titleLink?.getAttribute("href")).toBe("/title/title-r1");
  });

  it("still shows today section even when recommendations API fails", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    // Recommendations section should not appear
    expect(screen.queryByText("Recommended for You")).toBeNull();
  });
});

describe("HomePage — friends loved this week", () => {
  it("shows the friends loved rail when items are returned", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getFriendsLoved.mockImplementation(() =>
      Promise.resolve({
        items: [
          {
            id: "t1",
            title: "Loved Movie",
            poster_url: null,
            object_type: "MOVIE",
            love_count: 2,
            score: 4,
          },
        ],
      }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Friends Loved This Week")).toBeDefined();
    });

    expect(screen.getByText("Loved Movie")).toBeDefined();
  });

  it("hides the friends loved rail when items list is empty", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getFriendsLoved.mockImplementation(() =>
      Promise.resolve({ items: [] }),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Friends Loved This Week")).toBeNull();
  });

  it("still loads the page when getFriendsLoved API fails", async () => {
    mockUser = {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    apiMock.getFriendsLoved.mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Friends Loved This Week")).toBeNull();
  });
});
