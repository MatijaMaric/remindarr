import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";
import "../i18n";

// Fresh client per test — never the app singleton — so cache never leaks across tests
function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Mutable so individual tests can override auth state without re-mocking
let mockSubscriptions: { providerIds: number[]; onlyMine: boolean } | null = null;
let mockUser: { id: string; username: string; display_name: null; auth_provider: string; is_admin: boolean } | null = null;
let mockAuthLoading = false;

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    providers: null,
    loading: mockAuthLoading,
    sessionStatus: "authenticated",
    subscriptions: mockSubscriptions,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: { Provider: ({ children }: { children: ReactNode }) => children },
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

mock.module("../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
mock.module("../hooks/useGridNavigation", () => ({ useGridNavigation: () => undefined }));

mock.module("../components/loadFilters", () => ({
  loadFilters: () =>
    Promise.resolve({
      genres: [],
      providers: [],
      languages: [],
      regionProviderIds: [],
      priorityLanguageCodes: [],
    }),
}));

mock.module("../components/SearchBar", () => ({
  default: ({ onSearch }: any) => (
    <input data-testid="search-bar" onChange={(e) => onSearch(e.target.value)} />
  ),
}));
mock.module("../components/NewReleases", () => ({ default: () => null }));
mock.module("../components/CategoryBrowse", () => ({
  default: () => <div data-testid="category-browse" />,
}));

const { default: BrowsePage } = await import("./BrowsePage");

function makeWrapper(initialPath: string) {
  const client = newTestClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

afterEach(() => {
  cleanup();
  mockSubscriptions = null;
  mockUser = null;
  mockAuthLoading = false;
});

describe("BrowsePage active filter chips", () => {
  it("renders type filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=MOVIE") });

    const chip = screen.getByRole("button", { name: /remove movies filter/i });
    expect(chip).toBeDefined();
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders Shows type filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=SHOW") });

    const chip = screen.getByRole("button", { name: /remove shows filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders genre filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?genre=Action") });

    const chip = screen.getByRole("button", { name: /remove action filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders year range filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?yearMin=2020&yearMax=2024") });

    const chip = screen.getByRole("button", { name: /remove year range filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders minimum rating filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?minRating=7") });

    const chip = screen.getByRole("button", { name: /remove minimum rating filter/i });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders multiple active filter chips all as <button> elements", () => {
    render(<BrowsePage />, {
      wrapper: makeWrapper("/browse?type=SHOW&genre=Drama&minRating=8"),
    });

    const chips = screen.getAllByRole("button", { name: /remove .* filter/i });
    expect(chips.length).toBe(3);
    for (const chip of chips) {
      expect(chip.tagName).toBe("BUTTON");
    }
  });

  it("clicking a type chip removes the Movies filter from the page", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?type=MOVIE&genre=Action") });

    const moviesChip = screen.getByRole("button", { name: /remove movies filter/i });
    expect(moviesChip).toBeDefined();

    act(() => { fireEvent.click(moviesChip); });

    // After removing the Movies filter, the Movies chip should be gone
    expect(screen.queryByRole("button", { name: /remove movies filter/i })).toBeNull();
    // Genre chip for Action should still be present
    expect(screen.getByRole("button", { name: /remove action filter/i })).toBeDefined();
  });
});

describe("BrowsePage subscription preselect", () => {
  // Helper that captures the current URLSearchParams from inside the router tree
  function SearchParamsSpy({ onCapture }: { onCapture: (p: URLSearchParams) => void }) {
    const [sp] = useSearchParams();
    useEffect(() => { onCapture(sp); }, [sp, onCapture]);
    return null;
  }

  it("preselects subscribed providers when no provider param in URL", async () => {
    mockSubscriptions = { providerIds: [8, 337], onlyMine: false };

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <QueryClientProvider client={newTestClient()}>
          <MemoryRouter initialEntries={["/browse"]}>
            <BrowsePage />
            <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(captured?.get("provider")).toBe("8,337");
  });

  it("does not overwrite an existing provider param in the URL", async () => {
    mockSubscriptions = { providerIds: [8, 337], onlyMine: false };

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <QueryClientProvider client={newTestClient()}>
          <MemoryRouter initialEntries={["/browse?provider=15"]}>
            <BrowsePage />
            <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // The existing provider=15 should be preserved, not overwritten
    expect(captured?.get("provider")).toBe("15");
  });

  it("does not preselect when user has no subscriptions", async () => {
    mockSubscriptions = null;

    let captured: URLSearchParams | null = null;

    await act(async () => {
      render(
        <QueryClientProvider client={newTestClient()}>
          <MemoryRouter initialEntries={["/browse"]}>
            <BrowsePage />
            <SearchParamsSpy onCapture={(sp) => { captured = sp; }} />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(captured?.get("provider")).toBeNull();
  });
});

describe("BrowsePage CategoryBrowse mount gate", () => {
  it("renders CategoryBrowse immediately when user is not authenticated", async () => {
    mockUser = null;
    mockSubscriptions = null;
    mockAuthLoading = false;

    await act(async () => {
      render(<BrowsePage />, {
        wrapper: makeWrapper("/browse"),
      });
    });

    // With no user, subscriptionsReady flips true immediately
    await waitFor(() => {
      expect(screen.getByTestId("category-browse")).toBeDefined();
    });
  });

  it("does not render CategoryBrowse while authenticated user subscriptions are still loading", async () => {
    mockUser = { id: "u1", username: "alice", display_name: null, auth_provider: "local", is_admin: false };
    mockSubscriptions = null; // not yet loaded
    mockAuthLoading = false;

    await act(async () => {
      render(<BrowsePage />, {
        wrapper: makeWrapper("/browse"),
      });
    });

    // subscriptions is null + user is set → subscriptionsReady stays false
    expect(screen.queryByTestId("category-browse")).toBeNull();
  });

  it("renders CategoryBrowse once subscriptions settle for authenticated user", async () => {
    mockUser = { id: "u1", username: "alice", display_name: null, auth_provider: "local", is_admin: false };
    mockSubscriptions = { providerIds: [8], onlyMine: false };
    mockAuthLoading = false;

    await act(async () => {
      render(<BrowsePage />, {
        wrapper: makeWrapper("/browse"),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("category-browse")).toBeDefined();
    });
  });
});
