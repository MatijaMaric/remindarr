import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import "../i18n";

// --- Mocks ---

let mockUser: any = null;
let mockAuthLoading = false;

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading }),
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

// Ensure useIsMobile returns false so desktop layout renders in tests
mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
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

function makeRecommendation(id: string, overrides: Record<string, unknown> = {}) {
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

const mockBrowseTitles = mock(() =>
  Promise.resolve({
    titles: Array.from({ length: 20 }, (_, i) => makeSearchTitle(i + 1)),
    count: 20,
    page: 1,
    totalPages: 1,
  })
);

const mockGetUpcomingEpisodes = mock(() =>
  Promise.resolve({ today: [], upcoming: [], unwatched: [] })
);

const mockGetRecommendations = mock(() =>
  Promise.resolve({ recommendations: [], count: 0 })
);

const mockGetHomepageLayout = mock(() =>
  Promise.resolve({ homepage_layout: [
    { id: "today", enabled: true },
    { id: "upcoming", enabled: true },
    { id: "unwatched", enabled: true },
    { id: "recommendations", enabled: true },
    { id: "friends_loved", enabled: true },
  ]})
);

const mockGetUpNext = mock(() =>
  Promise.resolve({ items: [] })
);

const mockGetFriendsLoved = mock(() =>
  Promise.resolve({ items: [] })
);

mock.module("../api", () => ({
  browseTitles: mockBrowseTitles,
  getUpcomingEpisodes: mockGetUpcomingEpisodes,
  getRecommendations: mockGetRecommendations,
  getHomepageLayout: mockGetHomepageLayout,
  getUpNext: mockGetUpNext,
  getFriendsLoved: mockGetFriendsLoved,
}));

const { default: HomePage } = await import("./HomePage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockUser = null;
  mockAuthLoading = false;
  mockBrowseTitles.mockClear();
  mockGetUpcomingEpisodes.mockClear();
  mockGetRecommendations.mockClear();
  mockGetUpNext.mockClear();
  mockGetFriendsLoved.mockClear();

  // Reset defaults
  mockGetUpcomingEpisodes.mockImplementation(() =>
    Promise.resolve({ today: [], upcoming: [], unwatched: [] })
  );
  mockGetRecommendations.mockImplementation(() =>
    Promise.resolve({ recommendations: [], count: 0 })
  );
  mockGetUpNext.mockImplementation(() =>
    Promise.resolve({ items: [] })
  );
  mockGetFriendsLoved.mockImplementation(() =>
    Promise.resolve({ items: [] })
  );
});

describe("HomePage — unauthenticated landing", () => {
  it("renders hero section with CTA buttons", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Track movies & TV shows you love")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Get notified about new episodes, track what you've watched, and discover what's streaming."
      )
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

    expect(mockBrowseTitles).toHaveBeenCalledWith({ category: "popular", page: 1 }, expect.any(AbortSignal));
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
    mockBrowseTitles.mockImplementationOnce(() => Promise.reject(new Error("fail")));

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Track movies & TV shows you love")).toBeDefined();
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
      expect(screen.getByText("Track movies & TV shows you love")).toBeDefined();
    });

    expect(screen.queryByText("Recommended for You")).toBeNull();
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });
});

describe("HomePage — authenticated recommendations", () => {
  it("shows recommendations section when recommendations exist", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", {
        from_user: { id: "s2", username: "bob", name: "Bob", display_name: "Bob", image: null },
        title: { id: "title-r2", title: "Rec Movie r2", object_type: "SHOW", poster_url: null },
      }),
    ];
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 })
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
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 })
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Recommended for You")).toBeNull();
  });

  it("fetches recommendations with limit of 6", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(mockGetRecommendations).toHaveBeenCalledWith(6, undefined, expect.any(AbortSignal));
    });
  });

  it("shows 'See all' link to /discovery", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    const recs = [makeRecommendation("r1")];
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 1 })
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Recommended for You")).toBeDefined();
    });

    // Multiple "See all" links may exist (e.g. today section also has one).
    // Find the specific link pointing to /discovery.
    const seeAllLinks = screen.getAllByText(/See all/).map((el) => el.closest("a"));
    const discoveryLink = seeAllLinks.find((a) => a?.getAttribute("href") === "/discovery");
    expect(discoveryLink).toBeDefined();
  });

  it("links recommendation cards to title detail page", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    const recs = [makeRecommendation("r1")];
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 1 })
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
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    mockGetRecommendations.mockImplementation(() =>
      Promise.reject(new Error("network error"))
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
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    mockGetFriendsLoved.mockImplementation(() =>
      Promise.resolve({
        items: [
          { id: "t1", title: "Loved Movie", poster_url: null, object_type: "MOVIE", love_count: 2, score: 4 },
        ],
      })
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Friends Loved This Week")).toBeDefined();
    });

    expect(screen.getByText("Loved Movie")).toBeDefined();
  });

  it("hides the friends loved rail when items list is empty", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    mockGetFriendsLoved.mockImplementation(() =>
      Promise.resolve({ items: [] })
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Friends Loved This Week")).toBeNull();
  });

  it("still loads the page when getFriendsLoved API fails", async () => {
    mockUser = { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false };
    mockGetFriendsLoved.mockImplementation(() =>
      Promise.reject(new Error("network error"))
    );

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeDefined();
    });

    expect(screen.queryByText("Friends Loved This Week")).toBeNull();
  });
});
