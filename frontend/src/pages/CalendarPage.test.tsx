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
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";
import * as useIsMobileModule from "../hooks/useIsMobile";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// Initialize i18n before anything else (avoids mock.module leak)
import "../i18n";

// The agenda's scroll-spy needs an IntersectionObserver; a no-op is enough.
if (!("IntersectionObserver" in globalThis)) {
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    configurable: true,
    writable: true,
  });
}

// Must import after spies are set up in beforeEach
const { default: CalendarPage, SlideOverPanel } =
  await import("./CalendarPage");

// Signed-out session for calendar UI. Passed through the real AuthContext
// provider — do not spyOn(useAuth). A module spy returning `user: null` stays
// on the shared export and makes SettingsPage render nothing (`if (!user)
// return null`), so Profile Visibility's waitFor times out in a full run.
const signedOutAuth = {
  user: null,
  providers: null,
  loading: false,
  sessionStatus: "authenticated" as const,
  subscriptions: null,
  refreshSubscriptions: () => Promise.resolve(),
  login: () => Promise.resolve(),
  signup: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
};

function Providers({
  children,
  path = "/",
}: {
  children: ReactNode;
  path?: string;
}) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthContextModule.AuthContext value={signedOutAuth as any}>
          {children}
        </AuthContextModule.AuthContext>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}

let useIsMobileSpy: ReturnType<
  typeof spyOn<typeof useIsMobileModule, "useIsMobile">
>;
let apiSpies: ReturnType<typeof spyOn>[];
let mockWatchMovie: ReturnType<typeof spyOn<typeof api, "watchMovie">>;
let mockUnwatchMovie: ReturnType<typeof spyOn<typeof api, "unwatchMovie">>;

beforeEach(() => {
  useIsMobileSpy = spyOn(useIsMobileModule, "useIsMobile").mockReturnValue(
    false,
  );
  mockWatchMovie = spyOn(api, "watchMovie").mockResolvedValue(undefined as any);
  mockUnwatchMovie = spyOn(api, "unwatchMovie").mockResolvedValue(
    undefined as any,
  );
  apiSpies = [
    spyOn(api, "getCalendarTitles").mockResolvedValue({
      titles: [],
      episodes: [],
      count: 0,
    } as any),
    spyOn(api, "watchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "unwatchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "watchEpisodesBulk").mockResolvedValue(undefined as any),
    spyOn(api, "getCrowdedWeekSettings").mockResolvedValue({
      crowdedWeekThreshold: 5,
      crowdedWeekBadgeEnabled: 1,
    } as any),
    spyOn(api, "getSubscriptions").mockResolvedValue({
      providerIds: [],
    } as any),
  ];
});

afterEach(() => {
  useIsMobileSpy.mockRestore();
  mockWatchMovie.mockRestore();
  mockUnwatchMovie.mockRestore();
  apiSpies.forEach((s) => s.mockRestore());
  cleanup();
});

function gridEpisode(
  id: number,
  titleId: string,
  airDate: string,
  showTitle = `Show ${titleId}`,
  watched = false,
) {
  return {
    id,
    title_id: titleId,
    season_number: 1,
    episode_number: id,
    name: null,
    overview: null,
    air_date: airDate,
    still_path: null,
    show_title: showTitle,
    poster_url: null,
    is_watched: watched,
    offers: [],
  };
}

function gridTitle(
  id: string,
  objectType: "MOVIE" | "SHOW",
  releaseDate: string,
  name: string,
) {
  return {
    id,
    object_type: objectType,
    title: name,
    release_date: releaseDate,
    poster_url: null,
    age_certification: null,
    offers: [],
  };
}

describe("CalendarPage", () => {
  it("renders grid view by default on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Grid view has weekday headers
    expect(screen.getByText("Mon")).toBeDefined();
    expect(screen.getByText("Tue")).toBeDefined();
    expect(screen.getByText("Wed")).toBeDefined();
  });

  it("shows an error instead of an empty grid when the calendar fetch fails", async () => {
    apiSpies[0].mockRejectedValue(new Error("network"));
    render(<CalendarPage />, { wrapper: Wrapper });

    expect(
      await screen.findByText("Failed to load calendar. Please try again."),
    ).toBeDefined();
    expect(screen.queryByText("Mon")).toBeNull();
  });

  it("opens a labelled day dialog and restores its invoking day on Escape or close", async () => {
    render(
      <Providers path="/?month=2024-03">
        <CalendarPage />
      </Providers>,
    );
    const day = await screen.findByRole("button", { name: "20", exact: true });
    const dateLabel = new Date(2024, 2, 20).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    day.focus();
    fireEvent.click(day);
    const dialog = screen.getByRole("dialog", { name: dateLabel });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = screen.getByRole("button", { name: "Close", exact: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(day);

    fireEvent.click(day);
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(day);
  });

  it("renders view toggle buttons on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    expect(screen.getByTitle("Grid view")).toBeDefined();
    expect(screen.getByTitle("Agenda view")).toBeDefined();
  });

  it("switches to agenda view when agenda toggle is clicked", async () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Verify we're in grid mode (weekday headers visible)
    expect(screen.getByText("Mon")).toBeDefined();

    // Click agenda toggle
    fireEvent.click(screen.getByTitle("Agenda view"));

    // Grid weekday headers should be gone, date picker trigger should be visible
    expect(screen.queryByText("Mon")).toBeNull();
    // Agenda mode shows a date picker trigger button
    const today = new Date();
    const dateLabel = today.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    expect(screen.getByText(dateLabel)).toBeDefined();
  });

  it("switches back to grid view from agenda view", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));
    expect(screen.queryByText("Mon")).toBeNull();

    // Switch back to grid
    fireEvent.click(screen.getByTitle("Grid view"));
    expect(screen.getByText("Mon")).toBeDefined();
  });

  it("renders agenda view on mobile without toggle", () => {
    useIsMobileSpy.mockReturnValue(true);
    render(<CalendarPage />, { wrapper: Wrapper });

    // No toggle buttons on mobile
    expect(screen.queryByTitle("Grid view")).toBeNull();
    expect(screen.queryByTitle("Agenda view")).toBeNull();
    // The dots-only month grid is gone: no Month/Agenda switch either
    expect(screen.queryByRole("button", { name: "Month" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Agenda" })).toBeNull();
  });

  it("shows hide watched toggle on mobile agenda, off by default", () => {
    useIsMobileSpy.mockReturnValue(true);
    render(<CalendarPage />, { wrapper: Wrapper });

    const toggle = screen.getByTitle("Hide watched");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("view toggle buttons have aria-label attributes", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    const gridBtn = screen.getByRole("button", { name: /grid view/i });
    const agendaBtn = screen.getByRole("button", { name: /agenda view/i });
    expect(gridBtn).toBeDefined();
    expect(agendaBtn).toBeDefined();
  });

  it("view toggle buttons have correct aria-pressed state", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Default is grid view
    expect(
      screen
        .getByRole("button", { name: /grid view/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /agenda view/i })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    // Switch to agenda
    fireEvent.click(screen.getByRole("button", { name: /agenda view/i }));

    // Re-query after state update
    expect(
      screen
        .getByRole("button", { name: /grid view/i })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /agenda view/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("hide watched button has aria-label attribute", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda to show hide-watched toggle
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByRole("button", { name: /hide watched/i });
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("has no week view and no density toggle", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    expect(screen.queryByTitle("Week view")).toBeNull();
    expect(screen.queryByRole("button", { name: /compact/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /spacious/i })).toBeNull();
  });

  it("falls back to the month grid for old ?view=week links", () => {
    render(
      <Providers path="/?view=week">
        <CalendarPage />
      </Providers>,
    );
    expect(screen.getByText("Mon")).toBeDefined();
    expect(screen.queryByTestId("week-day-column")).toBeNull();
  });

  it("shows each month count once, with no total chip or legend", async () => {
    apiSpies[0].mockResolvedValue({
      titles: [gridTitle("movie-1", "MOVIE", "2024-03-05", "Big Movie")],
      episodes: [gridEpisode(1, "tv-1", "2024-03-06")],
      count: 1,
    } as any);
    render(
      <Providers path="/?month=2024-03">
        <CalendarPage />
      </Providers>,
    );

    expect(await screen.findByText("1 Episode")).toBeDefined();
    expect(screen.getByText("1 Title")).toBeDefined();
    expect(screen.queryByText(/Total/)).toBeNull();
    expect(screen.queryByText(/this month/)).toBeNull();
    expect(screen.queryByText("Tracked · airing")).toBeNull();
  });

  it("does not list a show premiere twice in the grid", async () => {
    apiSpies[0].mockResolvedValue({
      titles: [gridTitle("tv-1", "SHOW", "2024-03-06", "Lanterns")],
      episodes: [gridEpisode(1, "tv-1", "2024-03-06", "Lanterns")],
      count: 1,
    } as any);
    render(
      <Providers path="/?month=2024-03">
        <CalendarPage />
      </Providers>,
    );

    expect(await screen.findByText("1 Episode")).toBeDefined();
    expect(screen.queryByText("1 Title")).toBeNull();
    expect(screen.getAllByText("Lanterns").length).toBe(1);
  });

  it("keeps Hide watched and the month when switching views", async () => {
    apiSpies[0].mockImplementation((async ({ month }: { month: string }) => ({
      titles: [],
      episodes:
        month === "2024-03"
          ? [
              gridEpisode(1, "tv-1", "2024-03-06", "Seen Show", true),
              gridEpisode(2, "tv-2", "2024-03-07", "Fresh Show"),
            ]
          : [],
      count: 0,
    })) as any);
    render(
      <Providers path="/?month=2024-03">
        <CalendarPage />
      </Providers>,
    );

    expect(await screen.findByText("Seen Show")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /hide watched/i }));
    await waitFor(() => expect(screen.queryByText("Seen Show")).toBeNull());

    fireEvent.click(screen.getByTitle("Agenda view"));
    const agendaToggle = screen.getByRole("button", { name: /hide watched/i });
    expect(agendaToggle.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() =>
      expect(apiSpies[0]).toHaveBeenCalledWith({
        month: "2024-03",
        type: undefined,
      }),
    );
    expect(await screen.findByText("Fresh Show")).toBeDefined();
    expect(screen.queryByText("Seen Show")).toBeNull();

    fireEvent.click(screen.getByTitle("Grid view"));
    expect(await screen.findByText("Fresh Show")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: /March 2024|2024/ }),
    ).toBeDefined();
  });
});

describe("SlideOverPanel — movie watched toggle", () => {
  const movieTitle = {
    id: "m-1",
    object_type: "MOVIE" as const,
    title: "Dune: Part Two",
    original_title: null,
    release_year: 2024,
    release_date: "2024-03-01",
    runtime_minutes: 166,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: "en",
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    is_watched: false,
    offers: [],
  };

  const noop = () => {};

  function renderSlideOver(
    onToggleTitleWatched?: (id: string, watched: boolean) => void,
  ) {
    return render(
      <Providers>
        <SlideOverPanel
          selectedDate="2024-03-01"
          items={[{ type: "title", data: movieTitle }]}
          episodes={[]}
          titles={[movieTitle]}
          onClose={noop}
          onToggleWatched={noop as never}
          onBulkToggle={noop as never}
          onToggleTitleWatched={onToggleTitleWatched}
        />
      </Providers>,
    );
  }

  afterEach(() => {
    mockWatchMovie.mockClear();
    mockUnwatchMovie.mockClear();
  });

  it("renders a watched toggle button for a movie title", () => {
    renderSlideOver(noop);
    const btn = screen.getByRole("button", { name: /mark as watched/i });
    expect(btn).toBeTruthy();
  });

  it("wraps keyboard focus in both directions through the day contents", () => {
    renderSlideOver(noop);
    const close = screen.getByRole("button", { name: "Close", exact: true });
    const last = screen.getByRole("button", { name: /mark as watched/i });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("calls onToggleTitleWatched when the toggle is clicked", () => {
    const onToggle = mock((_id: string, _watched: boolean) => {});
    renderSlideOver(onToggle);
    const btn = screen.getByRole("button", { name: /mark as watched/i });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("m-1", false);
  });

  it("does NOT render a watched toggle when onToggleTitleWatched is not provided", () => {
    renderSlideOver(undefined);
    expect(
      screen.queryByRole("button", { name: /mark as watched/i }),
    ).toBeNull();
  });
});
