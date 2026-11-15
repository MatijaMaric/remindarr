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
const observers: MockIntersectionObserver[] = [];
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
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
  observers.length = 0;
});

describe("DiscoveryPage", () => {
  it("shows empty state when no recommendations", async () => {
    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText(/No recommendations yet/)).toBeDefined(),
    );
    expect(
      screen.getByText(
        "Find and track titles, then rate a few to improve recommendations.",
      ),
    ).toBeDefined();
  });

  it("has no tab bar: one 'For you' heading and no Activity tab (#1407)", async () => {
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [makeSearchTitle("movie-1")] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await screen.findByText("Top pick for you");
    expect(screen.getAllByText("For you")).toHaveLength(1);
    expect(screen.queryByText("Activity")).toBeNull();
    expect(apiMock.getUnreadRecommendationCount).not.toHaveBeenCalled();
  });

  it("does not show the empty state while suggestions are still loading (#1407)", async () => {
    let resolveAggregate: (v: SuggestionsAggregateResponse) => void = () => {};
    apiMock.getSuggestionsAggregate.mockImplementation(
      () =>
        new Promise<SuggestionsAggregateResponse>((r) => {
          resolveAggregate = r;
        }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => expect(apiMock.getRecommendations).toHaveBeenCalled());
    // Friends feed answered empty; suggestions have not answered yet.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/No recommendations yet/)).toBeNull();

    resolveAggregate(makeAggregate({ flat: [makeSearchTitle("movie-1")] }));
    expect(await screen.findByText("Title movie-1")).toBeDefined();
  });

  it("still shows suggestions when the friends feed fails (#1407)", async () => {
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.reject(new Error("boom")),
    );
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [makeSearchTitle("movie-1")] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    expect(await screen.findByText("Title movie-1")).toBeDefined();
    expect(screen.queryByText("Failed to load recommendations")).toBeNull();
  });

  it("shows the error when nothing loaded and a request failed", async () => {
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.reject(new Error("boom")),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    expect(
      await screen.findByText("Failed to load recommendations"),
    ).toBeDefined();
  });
});

describe("Friends are recommending row", () => {
  it("shows each recommended title with the sender's message", async () => {
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", {
        title: {
          id: "title-r2",
          title: "Show R2",
          object_type: "SHOW",
          poster_url: null,
        },
        message: "You should watch this!",
        is_targeted: true,
      }),
    ];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 }),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await screen.findByText("Friends are recommending");
    expect(screen.getByText("Movie r1")).toBeDefined();
    expect(screen.getByText("Show R2")).toBeDefined();
    expect(screen.getByText(/You should watch this!/)).toBeDefined();
    expect(screen.getByText(/@alice/)).toBeDefined();
    expect(screen.getByText("Direct")).toBeDefined();
  });

  it("marks a card's unread recommendations read once it is on screen", async () => {
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", { title: makeRecommendation("r1").title }),
      makeRecommendation("r3", { read_at: "2026-01-01T00:00:00Z" }),
    ];
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 3 }),
    );
    apiMock.markRecommendationRead.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });
    await screen.findByText("Friends are recommending");

    for (const io of [...observers]) {
      io.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        io as unknown as IntersectionObserver,
      );
    }

    await waitFor(() => {
      const ids = apiMock.markRecommendationRead.mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect([...new Set(ids)].sort()).toEqual(["r1", "r2"]);
    });
  });

  it("track on a friend card tracks the title", async () => {
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({
        recommendations: [makeRecommendation("r1")],
        count: 1,
      }),
    );
    apiMock.trackTitle.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });
    await screen.findByText("Friends are recommending");

    fireEvent.click(screen.getByText("Track"));

    await waitFor(() => {
      expect(apiMock.trackTitle.mock.calls[0]?.[0]).toBe("title-r1");
    });
    expect(apiMock.deleteRecommendation).not.toHaveBeenCalled();
  });
});

describe("each suggestion shown once (#1407)", () => {
  function group(
    id: string,
    suggestionIds: string[],
    hiddenCount = 0,
  ): SuggestionsAggregateResponse["groups"][number] {
    return {
      source: {
        id,
        title: `Seed ${id}`,
        posterUrl: null,
        reason: "loved" as SuggestionSeedReason,
      },
      suggestions: suggestionIds.map((s) => makeSearchTitle(s)),
      hiddenCount,
    };
  }

  it("drops titles already in the hero, Suggested next, friends row or an earlier row", async () => {
    const flat = ["a", "b"].map((s) => makeSearchTitle(s));
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(
        makeAggregate({
          flat,
          groups: [
            group("seed-1", ["a", "b", "c", "friend"]),
            group("seed-2", ["c", "d"]),
            group("seed-3", ["a", "d"]),
          ],
        }),
      ),
    );
    apiMock.getRecommendations.mockImplementation(() =>
      Promise.resolve({
        recommendations: [
          makeRecommendation("r1", {
            title: {
              id: "friend",
              title: "Title friend",
              object_type: "MOVIE",
              poster_url: null,
            },
          }),
        ],
        count: 1,
      }),
    );

    const { container } = render(<DiscoveryPage />, { wrapper: Wrapper });
    await screen.findByText("Top pick for you");

    const cardLinks = [...container.querySelectorAll("h3")].map((h) =>
      h.closest("a")?.getAttribute("href"),
    );
    // Hero "a" has no card; then Suggested next (b), friends (friend),
    // seed-1 (c) and seed-2 (d) — each title once.
    expect(cardLinks.sort()).toEqual(
      ["/title/b", "/title/c", "/title/d", "/title/friend"].sort(),
    );
    expect(screen.getByText("Because you loved Seed seed-1")).toBeDefined();
    expect(screen.getByText("Because you loved Seed seed-2")).toBeDefined();
    // Everything in seed-3 is shown above, so the row is not rendered.
    expect(screen.queryByText("Because you loved Seed seed-3")).toBeNull();
  });

  it("renders the hiddenCount subnote in a Because you group", async () => {
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(
        makeAggregate({ flat: [], groups: [group("seed", ["s1"], 2)] }),
      ),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    expect(
      await screen.findByText(
        /2 hidden — already tracked, watched or dismissed/,
      ),
    ).toBeDefined();
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

  it("hero hides the friends box when no friend recommended it (#1407)", async () => {
    const title1 = makeSearchTitle("movie-1");
    apiMock.getSuggestionsAggregate.mockImplementation(() =>
      Promise.resolve(makeAggregate({ flat: [title1], groups: [] })),
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await screen.findByText("Top pick for you");
    expect(screen.queryByText("Friends")).toBeNull();
    expect(screen.queryByText(/0 recs/)).toBeNull();
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
    // Message quote shown in the hero friends panel (and on the friends-row card)
    expect(
      screen.getAllByText(/You should watch this/).length,
    ).toBeGreaterThanOrEqual(1);
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

it("dismissal stays absent after remount with fresh cross-view caches", async () => {
  const title = makeSearchTitle("movie-dismissed");
  let dismissed = false;
  apiMock.getSuggestionsAggregate.mockImplementation(() =>
    Promise.resolve(
      makeAggregate({ flat: dismissed ? [] : [title], groups: [] }),
    ),
  );
  apiMock.dismissSuggestion.mockImplementation(async () => {
    dismissed = true;
  });
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 300_000, retry: false } },
  });
  for (const key of ["tracked", "home", "title-detail", "stats"])
    client.setQueryData([key], { old: true });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DiscoveryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(await screen.findByText("Not interested"));
  await waitFor(() =>
    expect(
      client.getQueryData<SuggestionsAggregateResponse>(["suggestions", 60])
        ?.flat,
    ).toHaveLength(0),
  );
  for (const key of ["tracked", "home", "title-detail", "stats"])
    expect(client.getQueryState([key])?.isInvalidated).toBe(true);
  view.unmount();
  render(tree());
  expect(screen.queryByText(title.title)).toBeNull();
  client.clear();
});
