import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import type {
  SearchTitle,
  SuggestionsAggregateResponse,
  SuggestionSeedReason,
} from "../types";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    },
    providers: { local: true, oidc: null },
    loading: false,
    sessionStatus: "authenticated",
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
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

// File-wide default impls that differ from the shared apiMock defaults.
function applyDiscoveryDefaults() {
  apiMock.getRecommendations.mockImplementation(() =>
    Promise.resolve({ recommendations: [], count: 0 }),
  );
  apiMock.getUnreadRecommendationCount.mockImplementation(() =>
    Promise.resolve({ count: 0 }),
  );
  apiMock.getSuggestionsAggregate.mockImplementation(() =>
    Promise.resolve({ flat: [], groups: [] }),
  );
}

beforeEach(() => {
  applyDiscoveryDefaults();
});

const { default: DiscoveryPage } = await import("./DiscoveryPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
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
      title: `Movie ${id}`,
      object_type: "MOVIE",
      poster_url: null,
    },
    message: null,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

function makeSearchTitle(
  id: string,
  overrides: Partial<SearchTitle> = {},
): SearchTitle {
  return {
    id,
    objectType: "MOVIE",
    title: `Title ${id}`,
    originalTitle: null,
    releaseYear: 2024,
    releaseDate: null,
    runtimeMinutes: null,
    shortDescription: null,
    genres: [],
    imdbId: null,
    tmdbId: "1",
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
    offers: [],
    scores: { imdbScore: null, imdbVotes: null, tmdbScore: 7.5 },
    ...overrides,
  };
}

function makeAggregate(
  overrides?: Partial<SuggestionsAggregateResponse>,
): SuggestionsAggregateResponse {
  return { flat: [], groups: [], ...overrides };
}

afterEach(() => {
  cleanup();
  resetApiMock();
});

describe("DiscoveryPage", () => {
  it("shows empty state when no recommendations", async () => {
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText(/No recommendations yet/)).toBeDefined(),
    );
  });

  it("renders recommendations list", async () => {
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", {
        from_user: {
          id: "sender2",
          username: "bob",
          name: "Bob",
          display_name: "Bob",
          image: null,
        },
        title: {
          id: "title-r2",
          title: "Show R2",
          object_type: "SHOW",
          poster_url: null,
        },
        message: "You should watch this!",
      }),
    ];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 2 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Switch to Activity tab where RecommendationCard feed is rendered
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Activity"));

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
      expect(screen.getByText("Show R2")).toBeDefined();
      expect(screen.getByText(/You should watch this!/)).toBeDefined();
    });
  });

  it("shows unread count badge", async () => {
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 5 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("5")).toBeDefined();
    });
  });

  it("track button on Activity tab calls trackTitle and removes the card", async () => {
    const rec = makeRecommendation("r1");
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 1 }),
    );
    apiMock.trackTitle.mockImplementation(() => Promise.resolve());
    apiMock.markRecommendationRead.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Switch to Activity tab where removing-on-track behaviour lives
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Activity"));

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
    });

    const trackButtons = screen.getAllByText("Track");
    fireEvent.click(trackButtons[0]);

    await waitFor(() => {
      expect(apiMock.trackTitle).toHaveBeenCalledWith("title-r1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Movie r1")).toBeNull();
    });
  });

  it("dismiss button calls deleteRecommendation and removes the card", async () => {
    const rec = makeRecommendation("r1");
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
    apiMock.deleteRecommendation.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Switch to Activity tab where RecommendationCard with "Dismiss" button is rendered
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Activity"));

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
    });

    const dismissButtons = screen.getAllByText("Dismiss");
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(apiMock.deleteRecommendation).toHaveBeenCalledWith("r1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Movie r1")).toBeNull();
    });
  });

  it("shows sender name and optional message on Activity tab", async () => {
    const rec = makeRecommendation("r1", {
      from_user: {
        id: "s1",
        username: "charlie",
        name: "Charlie D",
        display_name: "Charlie D",
        image: null,
      },
      message: "Great film!",
    });
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Sender details are shown on the Activity tab RecommendationCard
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Activity"));

    await waitFor(() => {
      expect(screen.getByText("Charlie D")).toBeDefined();
      expect(screen.getByText(/Great film!/)).toBeDefined();
    });
  });

  it("distinguishes movie and TV type labels", async () => {
    const recs = [
      makeRecommendation("r1", {
        title: {
          id: "t1",
          title: "A Movie",
          object_type: "MOVIE",
          poster_url: null,
        },
      }),
      makeRecommendation("r2", {
        title: {
          id: "t2",
          title: "A Show",
          object_type: "SHOW",
          poster_url: null,
        },
      }),
    ];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 }),
    );
    apiMock.getUnreadRecommendationCount.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Switch to Activity tab where RecommendationCard renders type badges via i18n
    await waitFor(() => {
      expect(screen.getByText("Activity")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Activity"));

    await waitFor(() => {
      expect(screen.getByText("A Movie")).toBeDefined();
      expect(screen.getByText("A Show")).toBeDefined();
    });

    // Check type badges (t("discovery.movie") = "Movie", t("discovery.tv") = "TV Show")
    const movieBadges = screen.getAllByText("Movie");
    const tvBadges = screen.getAllByText("TV Show");
    expect(movieBadges.length).toBeGreaterThanOrEqual(1);
    expect(tvBadges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("For you tab — suggestions", () => {
  it("hero renders the top untracked/undismissed suggestion from aggregate", async () => {
    const title1 = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title movie-1")).toBeDefined();
    });
    expect(screen.getByText("Top pick for you")).toBeDefined();
  });

  it("hero shows 'None of your friends have recommended this yet' when no recs match the hero", async () => {
    const title1 = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1], groups: [] })),
    );
    // default: no recommendations

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(/None of your friends have recommended this yet/),
      ).toBeDefined();
    });
  });

  it("hero shows friend recommendation signal when a rec matches the hero title", async () => {
    const heroTitle = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [heroTitle], groups: [] })),
    );
    const rec = makeRecommendation("r1", {
      title: {
        id: "movie-1",
        title: "Title movie-1",
        object_type: "MOVIE",
        poster_url: null,
      },
      from_user: {
        id: "u2",
        username: "bob",
        name: "Bob",
        display_name: "Bob",
        image: null,
      },
      message: "You should watch this",
    });
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      // Friend rec count label in hero signal grid
      expect(screen.getByText("1 rec")).toBeDefined();
    });
    // Message quote shown in hero friends panel
    expect(screen.getByText(/You should watch this/)).toBeDefined();
  });

  it("session counter reflects tracked and dismissed counts after actions", async () => {
    const title1 = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1], groups: [] })),
    );
    apiMock.trackTitle.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Top pick for you")).toBeDefined();
    });

    // Track the hero — counter should appear
    const trackButtons = screen.getAllByText("Track");
    fireEvent.click(trackButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 tracked · 0 dismissed/)).toBeDefined();
    });
  });

  it("clicking 'Not interested' on hero calls dismissSuggestion and shifts to next suggestion", async () => {
    const title1 = makeSearchTitle("movie-1");
    const title2 = makeSearchTitle("movie-2");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1, title2], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title movie-1")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Not interested"));

    await waitFor(() => {
      expect(apiMock.dismissSuggestion).toHaveBeenCalledWith("movie-1");
    });

    // Hero shifts to the second title
    await waitFor(() => {
      expect(screen.getByText("Title movie-2")).toBeDefined();
    });
  });

  it("clicking Undo on a dismissed friend rec calls undismissSuggestion", async () => {
    const rec = makeRecommendation("r1");
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    // Wait for "Friends are recommending" section to render
    await waitFor(() => {
      expect(screen.getByText("Friends are recommending")).toBeDefined();
    });

    // Dismiss the friend rec card
    fireEvent.click(screen.getByText("Dismiss"));

    await waitFor(() => {
      expect(apiMock.dismissSuggestion).toHaveBeenCalledWith("title-r1");
      // Dismiss swaps to Undo
      expect(screen.getByText("Undo")).toBeDefined();
    });

    // Click Undo
    fireEvent.click(screen.getByText("Undo"));

    await waitFor(() => {
      expect(apiMock.undismissSuggestion).toHaveBeenCalledWith("title-r1");
    });
  });

  it("renders the hiddenCount subnote in a Because you group", async () => {
    const suggestion = makeSearchTitle("movie-s1");
    const group = {
      source: {
        id: "movie-seed",
        title: "Seed Movie",
        posterUrl: null,
        reason: "watched" as SuggestionSeedReason,
      },
      suggestions: [suggestion],
      hiddenCount: 2,
    };
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve({
        flat: [suggestion],
        groups: [group],
      }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(/2 hidden — already tracked or dismissed/),
      ).toBeDefined();
    });
  });

  it("More for you rail renders MediaCard-styled cards (poster image links to title detail)", async () => {
    const title1 = makeSearchTitle("movie-1");
    const title2 = makeSearchTitle("movie-2", {
      posterUrl: "https://image.tmdb.org/t/p/w342/p2.jpg",
    });
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1, title2], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Suggested next")).toBeDefined();
    });

    // title2 is in the More for you rail; its poster is rendered as an <img>
    // wrapped in a Link to the title detail page (MediaCard structure).
    const poster = await screen.findByAltText("Title movie-2");
    expect(poster.tagName).toBe("IMG");
    expect(poster.closest("a")?.getAttribute("href")).toBe("/title/movie-2");

    // Track + Dismiss actions live in the card footer
    expect(screen.getAllByText("Track").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dismiss").length).toBeGreaterThanOrEqual(1);
  });

  it("Track button in More for you rail calls trackTitle with the suggestion id", async () => {
    const title1 = makeSearchTitle("movie-1");
    const title2 = makeSearchTitle("movie-2");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1, title2], groups: [] })),
    );
    apiMock.trackTitle.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Top pick for you")).toBeDefined();
    });

    // title2 is in the More for you rail; hero shows title1
    // There are two Track buttons: one for hero, one for moreForYou item
    const trackButtons = screen.getAllByText("Track");
    expect(trackButtons.length).toBeGreaterThanOrEqual(2);

    // Click the second Track button (moreForYou item = title2)
    fireEvent.click(trackButtons[1]);

    await waitFor(() => {
      // First argument should be the title id
      expect(apiMock.trackTitle.mock.calls[0]?.[0]).toBe("movie-2");
    });
  });

  it("hero renders an amber match-score chip when matchScore is present", async () => {
    const title = makeSearchTitle("movie-1", { matchScore: 94 });
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Top pick for you")).toBeDefined();
    });
    // Chip text node is lowercase; CSS text-transform: uppercase is visual-only
    expect(screen.getByText("94% match")).toBeDefined();
  });

  it("hero omits the match-score chip when matchScore is absent", async () => {
    const title = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Top pick for you")).toBeDefined();
    });
    expect(screen.queryByText(/% match/)).toBeNull();
  });
});
