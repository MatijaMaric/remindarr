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
  waitFor,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import * as useIsMobileModule from "../hooks/useIsMobile";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

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

// File-wide default impls that differ from the shared apiMock defaults.
function applyTrackedDefaults() {
  apiMock.getTrackedTitles.mockImplementation(() =>
    Promise.resolve({ titles: [], count: 0, profile_public: false }),
  );
  apiMock.bulkTrackAction.mockImplementation(() =>
    Promise.resolve({ updated: 0 }),
  );
}

beforeEach(() => {
  applyTrackedDefaults();
});

const { default: TrackedPage } = await import("./TrackedPage");
const { default: MorePage } = await import("./MorePage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  resetApiMock();
});

function makeShow(id: string, status: string | null, overrides = {}) {
  return {
    id,
    object_type: "SHOW",
    title: `Show ${id}`,
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-01",
    runtime_minutes: null,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    show_status: status,
    tracked_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMovie(id: string) {
  return {
    id,
    object_type: "MOVIE",
    title: `Movie ${id}`,
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-01",
    runtime_minutes: 120,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    tracked_at: "2024-01-01T00:00:00Z",
  };
}

describe("TrackedPage", () => {
  it("shows loading state initially", () => {
    apiMock.getTrackedTitles.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<TrackedPage />, { wrapper: Wrapper });
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows error message when fetch fails", async () => {
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.reject(new Error("Network error")),
    );
    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText("An error occurred")).toBeDefined(),
    );
  });

  it("shows empty message when no tracked titles", async () => {
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles: [], count: 0, profile_public: false }),
    );
    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText(/No tracked titles yet/)).toBeDefined(),
    );
  });

  it("groups shows by status with section headers", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeShow("s2", "caught_up"),
      makeShow("s3", "not_started"),
      makeShow("s4", "completed"),
      makeMovie("m1"),
    ];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // Default view is list; switch to grid to see section headers
    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
      expect(screen.getByText("Caught Up (1)")).toBeDefined();
      expect(screen.getByText("Not Started (1)")).toBeDefined();
      expect(screen.getByText("Completed (1)")).toBeDefined();
      expect(screen.getByText("Movies (1)")).toBeDefined();
    });
  });

  it("does not render empty groups", async () => {
    const titles = [makeShow("s1", "watching"), makeMovie("m1")];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
    });

    // These section headers (h3) should not exist — note that status filter tab buttons
    // like "Completed" and "Watching" are always rendered but as tab buttons, not group headers.
    // Group headers use the pattern "Label (count)" so we check for those specific patterns.
    expect(screen.queryByText("Caught Up (0)")).toBeNull();
    expect(screen.queryByText(/^Caught Up \(/)).toBeNull();
    expect(screen.queryByText("Not Started (0)")).toBeNull();
    expect(screen.queryByText(/^Not Started \(/)).toBeNull();
    expect(screen.queryByText("Unreleased (0)")).toBeNull();
    expect(screen.queryByText(/^Unreleased \(/)).toBeNull();
    expect(screen.queryByText("Completed (0)")).toBeNull();
    expect(screen.queryByText(/^Completed \(/)).toBeNull();
  });

  it("shows movies in their own section after shows", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeMovie("m1"),
      makeMovie("m2"),
    ];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Movies (2)")).toBeDefined();
    });
  });

  it("shows total count in header", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeShow("s2", "completed"),
      makeMovie("m1"),
    ];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // The new header uses a PageHeader kicker showing "Your library · N title(s)"
    await waitFor(() => {
      expect(screen.getByText("Your library · 3 titles")).toBeDefined();
    });
  });

  it("exposes status filters as an ARIA tablist with selected state", async () => {
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({
        titles: [makeShow("s1", "watching")],
        count: 1,
        profile_public: false,
      }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(
        screen.getByRole("tablist", { name: "Filter by status" }),
      ).toBeDefined(),
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(6);

    const allTab = screen.getByRole("tab", { name: /All/ });
    expect(allTab.getAttribute("aria-selected")).toBe("true");
    expect(allTab.getAttribute("aria-controls")).toBe("tracked-status-panel");

    const watchingTab = screen.getByRole("tab", { name: /Watching/ });
    expect(watchingTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(watchingTab);
    expect(watchingTab.getAttribute("aria-selected")).toBe("true");
    expect(allTab.getAttribute("aria-selected")).toBe("false");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("id")).toBe("tracked-status-panel");
    expect(panel.getAttribute("aria-labelledby")).toBe(
      "tracked-status-tab-watching",
    );
  });

  it("renders unreleased section when shows have unreleased status", async () => {
    const titles = [makeShow("s1", "unreleased")];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Unreleased (1)")).toBeDefined();
    });
  });

  it("does not show movies section when there are no movies", async () => {
    const titles = [makeShow("s1", "watching")];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
    });

    expect(screen.queryByText(/^Movies/)).toBeNull();
  });
});

function ViewHistory() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function renderViewRoute(path: string) {
  apiMock.getStats.mockImplementation(() =>
    Promise.resolve({
      overview: {
        watched_movies: 0,
        watched_episodes: 0,
        tracked_shows: 0,
        tracked_movies: 0,
        watch_time_minutes: 0,
        watch_time_minutes_shows: 0,
        watch_time_minutes_movies: 0,
      },
      genres: [],
      languages: [],
      monthly: [],
      shows_by_status: {},
    }),
  );
  return render(
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ViewHistory />
        <Routes>
          <Route
            path="/stats"
            element={<Navigate to="/tracked?view=stats" replace />}
          />
          <Route path="/tracked" element={<TrackedPage />} />
          <Route path="/more" element={<MorePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TrackedPage URL views", () => {
  it.each(["/stats", "/tracked?view=stats"])(
    "opens Stats directly from %s",
    async (path) => {
      renderViewRoute(path);
      await screen.findByText("Movies Watched");
      expect(screen.queryByRole("tablist")).toBeNull();
    },
  );

  it("opens Stats from the mobile More menu", async () => {
    const mobile = spyOn(useIsMobileModule, "useIsMobile").mockReturnValue(
      true,
    );
    try {
      renderViewRoute("/more");
      fireEvent.click(screen.getByRole("link", { name: /Stats/ }));
      await screen.findByText("Movies Watched");
    } finally {
      mobile.mockRestore();
    }
  });

  it.each([
    "/tracked",
    "/tracked?view=invalid",
    "/tracked?view=list",
    "/tracked?view=grid",
  ])(
    "restores supported views and defaults invalid views at %s",
    async (path) => {
      apiMock.getTrackedTitles.mockImplementation(() =>
        Promise.resolve({ titles: [makeShow("s1", "watching")], count: 1 }),
      );
      renderViewRoute(path);
      if (path.endsWith("grid")) {
        await screen.findByText("Currently Watching (1)");
      } else {
        await screen.findByText("Show s1");
        expect(screen.queryByRole("article")).toBeNull();
      }
    },
  );

  it("preserves other parameters and restores view changes through history and remounts", async () => {
    const result = renderViewRoute("/tracked?keep=1&view=stats");
    await screen.findByText("Movies Watched");
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(screen.getByLabelText("Current URL").textContent).toBe(
      "/tracked?keep=1&view=grid",
    );
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByLabelText("Current URL").textContent).toBe(
      "/tracked?keep=1&view=list",
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Current URL").textContent).toBe(
      "/tracked?keep=1&view=grid",
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Movies Watched");
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.queryByText("Movies Watched")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    const url = screen.getByLabelText("Current URL").textContent!;
    expect(url).toBe("/tracked?keep=1&view=stats");
    result.unmount();
    renderViewRoute(url);
    await screen.findByText("Movies Watched");
  });
});

describe("TrackedPage select mode", () => {
  it("shows Select toggle button", async () => {
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({
        titles: [makeMovie("m1"), makeMovie("m2")],
        count: 2,
        profile_public: false,
      }),
    );
    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());
  });

  it("enters select mode and shows the bulk action bar when a title is selected", async () => {
    const titles = [makeMovie("m1"), makeMovie("m2")];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // Wait for data to load
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());

    // Click Select to enter select mode
    fireEvent.click(screen.getByText("Select"));

    // The "Select titles" helper message should appear (0 selected)
    await waitFor(() =>
      expect(
        screen.getByText("Select titles to apply bulk actions"),
      ).toBeDefined(),
    );
  });

  it("exits select mode when Cancel is clicked", async () => {
    const titles = [makeMovie("m1")];
    apiMock.getTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false }),
    );

    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());

    fireEvent.click(screen.getByText("Select"));
    await waitFor(() =>
      expect(
        screen.getByText("Select titles to apply bulk actions"),
      ).toBeDefined(),
    );

    // Click Cancel in the bar
    fireEvent.click(screen.getByText("Cancel"));

    // Bar should be gone
    await waitFor(() =>
      expect(
        screen.queryByText("Select titles to apply bulk actions"),
      ).toBeNull(),
    );
  });
});

const sortCases = [
  ["last_aired", ["Zulu", "Alpha", "Bravo"]],
  ["title", ["Alpha", "Bravo", "Zulu"]],
  ["rating", ["Alpha", "Zulu", "Bravo"]],
  ["progress", ["Bravo", "Alpha", "Zulu"]],
] as const;

function sortableShows(status: string) {
  return [
    makeShow(`${status}-z`, status, {
      title: "Zulu",
      imdb_score: 8,
      total_episodes: 10,
      watched_episodes_count: 2,
      latest_released_air_date: "2026-01-03",
      next_episode_air_date: "2026-02-03",
    }),
    makeShow(`${status}-a`, status, {
      title: "Alpha",
      imdb_score: 9,
      total_episodes: 10,
      watched_episodes_count: 4,
      latest_released_air_date: "2026-01-02",
      next_episode_air_date: "2026-02-02",
    }),
    makeShow(`${status}-b`, status, {
      title: "Bravo",
      imdb_score: 7,
      total_episodes: 10,
      watched_episodes_count: 9,
      latest_released_air_date: "2026-01-01",
      next_episode_air_date: "2026-02-01",
    }),
  ];
}

describe("TrackedPage sorting", () => {
  it.each(sortCases)(
    "applies %s within every All Grid group",
    async (sort, order) => {
      const movies = sortableShows("movie").map((title) => ({
        ...title,
        object_type: "MOVIE",
        show_status: undefined,
      }));
      const titles = [
        ...sortableShows("watching"),
        ...sortableShows("caught_up"),
        ...movies,
      ];
      apiMock.getTrackedTitles.mockImplementation(() =>
        Promise.resolve({ titles, count: titles.length }),
      );
      render(<TrackedPage />, { wrapper: Wrapper });
      await screen.findAllByRole("link", { name: "Alpha" });
      fireEvent.click(screen.getByRole("button", { name: "Grid" }));
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: sort },
      });
      for (const name of [
        "Currently Watching (3)",
        "Caught Up (3)",
        "Movies (3)",
      ]) {
        const group = screen.getByRole("heading", { name }).parentElement!;
        expect(
          within(group)
            .getAllByRole("article")
            .map((card) => card.getAttribute("aria-label")),
        ).toEqual([...order]);
      }
    },
  );

  it.each(sortCases)(
    "keeps %s ordering when switching between List and filtered/unfiltered Grid",
    async (sort, order) => {
      const titles = sortableShows("watching");
      apiMock.getTrackedTitles.mockImplementation(() =>
        Promise.resolve({ titles, count: titles.length }),
      );
      render(<TrackedPage />, { wrapper: Wrapper });
      await screen.findAllByRole("link", { name: "Alpha" });
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: sort },
      });
      const rowOrder = () =>
        screen
          .getAllByRole("link", { name: /^(Zulu|Alpha|Bravo)$/ })
          .map((link) => link.textContent);
      expect(rowOrder()).toEqual([...order]);
      fireEvent.click(screen.getByRole("button", { name: "Grid" }));
      const cardOrder = () =>
        screen
          .getAllByRole("article")
          .map((card) => card.getAttribute("aria-label"));
      expect(cardOrder()).toEqual([...order]);
      fireEvent.click(screen.getByRole("tab", { name: /^Watching/ }));
      expect(cardOrder()).toEqual([...order]);
      fireEvent.click(screen.getByRole("button", { name: "List" }));
      expect(rowOrder()).toEqual([...order]);
    },
  );
});
