import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false },
    providers: { local: true, oidc: null },
    loading: false,
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

const mockGetRecommendations = mock(() =>
  Promise.resolve({ recommendations: [], count: 0 })
);
const mockGetUnreadCount = mock(() =>
  Promise.resolve({ count: 0 })
);
const mockTrackTitle = mock(() => Promise.resolve());
const mockMarkRecommendationRead = mock(() => Promise.resolve());
const mockDeleteRecommendation = mock(() => Promise.resolve());

mock.module("../api", () => ({
  getRecommendations: mockGetRecommendations,
  getUnreadRecommendationCount: mockGetUnreadCount,
  trackTitle: mockTrackTitle,
  markRecommendationRead: mockMarkRecommendationRead,
  deleteRecommendation: mockDeleteRecommendation,
}));

const { default: DiscoveryPage } = await import("./DiscoveryPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
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

afterEach(() => {
  cleanup();
  mockGetRecommendations.mockReset();
  mockGetUnreadCount.mockReset();
  mockTrackTitle.mockReset();
  mockMarkRecommendationRead.mockReset();
  mockDeleteRecommendation.mockReset();

  // Reset defaults
  mockGetRecommendations.mockImplementation(() =>
    Promise.resolve({ recommendations: [], count: 0 })
  );
  mockGetUnreadCount.mockImplementation(() =>
    Promise.resolve({ count: 0 })
  );
});

describe("DiscoveryPage", () => {
  it("shows empty state when no recommendations", async () => {
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 0 })
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByText(/No recommendations yet/)).toBeDefined()
    );
  });

  it("renders recommendations list", async () => {
    const recs = [
      makeRecommendation("r1"),
      makeRecommendation("r2", {
        from_user: { id: "sender2", username: "bob", name: "Bob", display_name: "Bob", image: null },
        title: { id: "title-r2", title: "Show R2", object_type: "SHOW", poster_url: null },
        message: "You should watch this!",
      }),
    ];
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 2 })
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
      expect(screen.getByText("Show R2")).toBeDefined();
      expect(screen.getByText(/You should watch this!/)).toBeDefined();
    });
  });

  it("shows unread count badge", async () => {
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [], count: 0 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 5 })
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("5")).toBeDefined();
    });
  });

  it("track button calls trackTitle and removes the card", async () => {
    const rec = makeRecommendation("r1");
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 1 })
    );
    mockTrackTitle.mockImplementation(() => Promise.resolve());
    mockMarkRecommendationRead.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
    });

    const trackButtons = screen.getAllByText("Track");
    fireEvent.click(trackButtons[0]);

    await waitFor(() => {
      expect(mockTrackTitle).toHaveBeenCalledWith("title-r1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Movie r1")).toBeNull();
    });
  });

  it("dismiss button calls deleteRecommendation and removes the card", async () => {
    const rec = makeRecommendation("r1");
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 0 })
    );
    mockDeleteRecommendation.mockImplementation(() => Promise.resolve());

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Movie r1")).toBeDefined();
    });

    const dismissButtons = screen.getAllByText("Dismiss");
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(mockDeleteRecommendation).toHaveBeenCalledWith("r1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Movie r1")).toBeNull();
    });
  });

  it("shows sender name and optional message", async () => {
    const rec = makeRecommendation("r1", {
      from_user: { id: "s1", username: "charlie", name: "Charlie D", display_name: "Charlie D", image: null },
      message: "Great film!",
    });
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: [rec], count: 1 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 0 })
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Charlie D")).toBeDefined();
      expect(screen.getByText(/Great film!/)).toBeDefined();
    });
  });

  it("distinguishes movie and TV type labels", async () => {
    const recs = [
      makeRecommendation("r1", {
        title: { id: "t1", title: "A Movie", object_type: "MOVIE", poster_url: null },
      }),
      makeRecommendation("r2", {
        title: { id: "t2", title: "A Show", object_type: "SHOW", poster_url: null },
      }),
    ];
    mockGetRecommendations.mockImplementation(() =>
      Promise.resolve({ recommendations: recs, count: 2 })
    );
    mockGetUnreadCount.mockImplementation(() =>
      Promise.resolve({ count: 0 })
    );

    render(<DiscoveryPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("A Movie")).toBeDefined();
      expect(screen.getByText("A Show")).toBeDefined();
    });

    // Check type badges
    const movieBadges = screen.getAllByText("Movie");
    const tvBadges = screen.getAllByText("TV Show");
    expect(movieBadges.length).toBeGreaterThanOrEqual(1);
    expect(tvBadges.length).toBeGreaterThanOrEqual(1);
  });
});
