import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import "../i18n";

// Fresh client per test — never the app singleton — so cache never leaks across tests
function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Mutable so individual tests can override auth state without re-mocking
let mockSubscriptions: { providerIds: number[]; onlyMine: boolean } | null =
  null;
let mockUser: {
  id: string;
  username: string;
  display_name: null;
  auth_provider: string;
  is_admin: boolean;
} | null = null;
let mockAuthLoading = false;
let mockSubscriptionsStatus = "loading";
const mockRefreshSubscriptions = mock(() => Promise.resolve());

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    providers: null,
    loading: mockAuthLoading,
    sessionStatus: "authenticated",
    subscriptions: mockSubscriptions,
    subscriptionsStatus: mockSubscriptionsStatus,
    refreshSubscriptions: mockRefreshSubscriptions,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

mock.module("../hooks/useIsMobile", () => ({ useIsMobile: () => false }));
mock.module("../hooks/useGridNavigation", () => ({
  useGridNavigation: () => undefined,
}));

// IMPORTANT: do NOT mock.module() the child component modules (SearchBar,
// NewReleases, CategoryBrowse, loadFilters). Bun leaks mock.module() globally
// across test files on Linux CI with no way to un-mock, so stubbing those
// modules here corrupted their own dedicated tests. Instead we render the REAL
// children and feed them benign data through the ../api mock below.

// CategoryBrowse uses IntersectionObserver for infinite-scroll; provide a no-op.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: MockIntersectionObserver,
  writable: true,
  configurable: true,
});
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

const BROWSE_TITLE = "Browse Result Title";
function makeBrowseResponse() {
  return {
    titles: [
      {
        id: "browse-1",
        objectType: "MOVIE" as const,
        title: BROWSE_TITLE,
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
  };
}

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

beforeEach(() => {
  // BrowsePage renders the real CategoryBrowse; feed it a known title so the
  // mount-gate tests can assert CategoryBrowse actually rendered. Other api fns
  // use the shared apiMock defaults.
  apiMock.browseTitles.mockImplementation(async () => makeBrowseResponse());
});

afterEach(() => {
  cleanup();
  resetApiMock();
  mockSubscriptions = null;
  mockUser = null;
  mockAuthLoading = false;
  mockSubscriptionsStatus = "loading";
  mockRefreshSubscriptions.mockClear();
  sessionStorage.clear();
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
    render(<BrowsePage />, {
      wrapper: makeWrapper("/browse?yearMin=2020&yearMax=2024"),
    });

    const chip = screen.getByRole("button", {
      name: /remove year range filter/i,
    });
    expect(chip.tagName).toBe("BUTTON");
  });

  it("renders minimum rating filter chip as a <button>", () => {
    render(<BrowsePage />, { wrapper: makeWrapper("/browse?minRating=7") });

    const chip = screen.getByRole("button", {
      name: /remove minimum rating filter/i,
    });
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
    render(<BrowsePage />, {
      wrapper: makeWrapper("/browse?type=MOVIE&genre=Action"),
    });

    const moviesChip = screen.getByRole("button", {
      name: /remove movies filter/i,
    });
    expect(moviesChip).toBeDefined();

    act(() => {
      fireEvent.click(moviesChip);
    });

    // After removing the Movies filter, the Movies chip should be gone
    expect(
      screen.queryByRole("button", { name: /remove movies filter/i }),
    ).toBeNull();
    // Genre chip for Action should still be present
    expect(
      screen.getByRole("button", { name: /remove action filter/i }),
    ).toBeDefined();
  });
});

const USER = {
  id: "u1",
  username: "alice",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

function SearchParamsSpy() {
  const [params] = useSearchParams();
  return <span data-testid="search-params">{params.toString()}</span>;
}

function currentParams() {
  return new URLSearchParams(screen.getByTestId("search-params").textContent!);
}

function renderBrowse(path = "/browse") {
  return render(
    <>
      <BrowsePage />
      <SearchParamsSpy />
    </>,
    { wrapper: makeWrapper(path) },
  );
}

describe("BrowsePage saved service preference", () => {
  it("uses the saved enabled preference without preselecting separate providers", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [8, 337], onlyMine: true };
    renderBrowse();
    await screen.findByText(BROWSE_TITLE);
    expect(
      screen
        .getByRole("button", { name: /On my services$/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(currentParams().has("provider")).toBe(false);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: true,
      provider: undefined,
    });
    expect(apiMock.browseTitles).toHaveBeenCalledTimes(1);
  });

  it("leaves browsing unfiltered with the saved preference disabled", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [8], onlyMine: false };
    renderBrowse();
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: undefined,
      provider: undefined,
    });
  });

  it("honors an explicit false override and Clear filters without changing the saved preference", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [8], onlyMine: true };
    renderBrowse("/browse?onlyMine=false&provider=15");
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: undefined,
      provider: "15",
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear", exact: true }));
    expect(currentParams().get("onlyMine")).toBe("false");
    expect(currentParams().has("provider")).toBe(false);
    expect(mockSubscriptions.onlyMine).toBe(true);
  });

  it("allows Clear when the saved service preference is the only active filter", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [8], onlyMine: true };
    renderBrowse();
    await screen.findByText(BROWSE_TITLE);
    const clear = screen.getByRole("button", { name: "Clear", exact: true });
    expect(clear.hasAttribute("disabled")).toBe(false);
    fireEvent.click(clear);
    expect(currentParams().get("onlyMine")).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /On my services$/ })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("honors an explicit enabled override when the saved preference is disabled", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [8], onlyMine: false };
    renderBrowse("/browse?onlyMine=true");
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: true,
    });
  });

  it("does not apply the preference when no services are subscribed", async () => {
    mockUser = USER;
    mockSubscriptions = { providerIds: [], onlyMine: true };
    renderBrowse();
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: undefined,
    });
    expect(
      screen.queryByRole("button", { name: /On my services$/ }),
    ).toBeNull();
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

    // With no user, subscriptionsReady flips true immediately → CategoryBrowse
    // mounts and renders its (mocked) results.
    await waitFor(() => {
      expect(screen.getByText(BROWSE_TITLE)).toBeDefined();
    });
  });

  it("does not render CategoryBrowse while authenticated user subscriptions are still loading", async () => {
    mockUser = {
      id: "u1",
      username: "alice",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    mockSubscriptions = null; // not yet loaded
    mockAuthLoading = false;

    await act(async () => {
      render(<BrowsePage />, {
        wrapper: makeWrapper("/browse"),
      });
    });

    // subscriptions is null + user is set → subscriptionsReady stays false, so
    // CategoryBrowse never mounts and its results never appear.
    expect(screen.queryByText(BROWSE_TITLE)).toBeNull();
  });

  it("renders CategoryBrowse once subscriptions settle for authenticated user", async () => {
    mockUser = {
      id: "u1",
      username: "alice",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    };
    mockSubscriptions = { providerIds: [8], onlyMine: false };
    mockAuthLoading = false;

    await act(async () => {
      render(<BrowsePage />, {
        wrapper: makeWrapper("/browse"),
      });
    });

    await waitFor(() => {
      expect(screen.getByText(BROWSE_TITLE)).toBeDefined();
    });
  });
});

describe("BrowsePage preference failures", () => {
  it("shows an actionable preference error and retries before one filtered catalog request", async () => {
    mockUser = USER;
    mockSubscriptionsStatus = "error";
    const view = renderBrowse();
    expect(screen.getByRole("alert").textContent).toContain(
      "service preferences",
    );
    expect(apiMock.browseTitles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry preferences" }));
    expect(mockRefreshSubscriptions).toHaveBeenCalledTimes(1);
    mockSubscriptionsStatus = "loading";
    view.rerender(
      <>
        <BrowsePage />
        <SearchParamsSpy />
      </>,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "service preferences",
    );
    expect(apiMock.browseTitles).not.toHaveBeenCalled();
    mockSubscriptionsStatus = "success";
    mockSubscriptions = { providerIds: [8], onlyMine: true };
    view.rerender(
      <>
        <BrowsePage />
        <SearchParamsSpy />
      </>,
    );
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.browseTitles).toHaveBeenCalledTimes(1);
    expect(apiMock.browseTitles.mock.calls[0][0]).toMatchObject({
      onlyMine: true,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps catalog errors separate from successfully loaded preferences", async () => {
    mockUser = USER;
    mockSubscriptionsStatus = "success";
    mockSubscriptions = { providerIds: [8], onlyMine: false };
    apiMock.browseTitles.mockRejectedValue(new Error("Catalog unavailable"));
    renderBrowse();
    await screen.findAllByText("Catalog unavailable");
    expect(
      screen.queryByRole("button", { name: "Retry preferences" }),
    ).toBeNull();
  });
});

function NavigationControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => navigate(-1)}>History back</button>
      <button onClick={() => navigate(1)}>History forward</button>
      <span data-testid="entry-key">{location.key}</span>
      <SearchParamsSpy />
    </>
  );
}

describe("BrowsePage restorable search", () => {
  it("restores a fresh search URL and its filters without loading a catalog", async () => {
    apiMock.searchTitles.mockResolvedValue(makeBrowseResponse());
    renderBrowse(
      "/browse?q=Breaking+Bad&searchType=SHOW&searchYearMin=2008&searchYearMax=2013&searchMinRating=8&searchLanguage=en&provider=8",
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Breaking Bad",
    );
    await screen.findByText(BROWSE_TITLE);
    expect(apiMock.searchTitles.mock.calls[0][0]).toBe("Breaking Bad");
    expect(apiMock.searchTitles.mock.calls[0][1]).toEqual({
      type: "SHOW",
      yearMin: 2008,
      yearMax: 2013,
      minRating: 8,
      language: "en",
    });
    expect(apiMock.browseTitles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear", exact: true }));
    expect(currentParams().has("q")).toBe(false);
    expect(currentParams().has("searchType")).toBe(false);
    expect(currentParams().get("provider")).toBe("8");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("restores submitted results, query and scroll after detail Back and forward", async () => {
    apiMock.searchTitles.mockResolvedValue(makeBrowseResponse());
    const scroll = mock(() => {});
    const originalScrollTo = window.scrollTo;
    window.scrollTo = scroll;
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={["/browse"]}>
          <NavigationControls />
          <Routes>
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/title/:id" element={<h1>Title detail</h1>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Breaking Bad" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Search", exact: true }),
    );
    await screen.findByText(BROWSE_TITLE);
    const key = screen.getByTestId("entry-key").textContent;
    expect(currentParams().get("q")).toBe("Breaking Bad");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 640,
    });
    fireEvent.scroll(window);
    fireEvent.click(
      screen.getByRole("link", { name: BROWSE_TITLE, exact: true }),
    );
    await screen.findByText("Title detail");
    expect(sessionStorage.getItem(`scroll:browse:${key}`)).toBe("640");
    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await screen.findByText(BROWSE_TITLE);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Breaking Bad",
    );
    expect(scroll).toHaveBeenCalledWith({ top: 640, behavior: "instant" });
    expect(apiMock.searchTitles).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "History forward" }));
    await screen.findByText("Title detail");
    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await screen.findByText(BROWSE_TITLE);
    expect(currentParams().get("q")).toBe("Breaking Bad");
    window.scrollTo = originalScrollTo;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("keeps the previous search scroll when submitting another query", async () => {
    apiMock.searchTitles.mockResolvedValue(makeBrowseResponse());
    const originalScrollTo = window.scrollTo;
    const scroll = mock(({ top }: { top: number }) => {
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: top,
      });
    });
    window.scrollTo = scroll as typeof window.scrollTo;
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={["/browse?q=First"]}>
          <NavigationControls />
          <BrowsePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText(BROWSE_TITLE);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 640,
    });
    fireEvent.scroll(window);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Second" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Search", exact: true }),
    );
    await screen.findByText(BROWSE_TITLE);
    await waitFor(() => expect(window.scrollY).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: "History back" }));
    await screen.findByText(BROWSE_TITLE);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "First",
    );
    expect(window.scrollY).toBe(640);
    window.scrollTo = originalScrollTo;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("keeps search loading and failure distinct from catalog mode and supports retry", async () => {
    let rejectSearch!: (error: Error) => void;
    apiMock.searchTitles.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSearch = reject;
        }),
    );
    renderBrowse("/browse?q=Breaking+Bad");
    expect(screen.getByRole("status").textContent).toContain(
      "Searching titles",
    );
    expect(apiMock.browseTitles).not.toHaveBeenCalled();
    await act(async () => rejectSearch(new Error("Search offline")));
    await screen.findByText(/Search offline/);
    expect(apiMock.browseTitles).not.toHaveBeenCalled();
    apiMock.searchTitles.mockResolvedValue(makeBrowseResponse());
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    await screen.findByText(BROWSE_TITLE);
  });
});
