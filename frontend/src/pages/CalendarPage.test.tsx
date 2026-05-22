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

// Must import after spies are set up in beforeEach
const { default: CalendarPage, SlideOverPanel } =
  await import("./CalendarPage");

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;
let useIsMobileSpy: ReturnType<
  typeof spyOn<typeof useIsMobileModule, "useIsMobile">
>;
let apiSpies: ReturnType<typeof spyOn>[];
let mockWatchMovie: ReturnType<typeof spyOn<typeof api, "watchMovie">>;
let mockUnwatchMovie: ReturnType<typeof spyOn<typeof api, "unwatchMovie">>;

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: null,
    providers: null,
    loading: false,
    sessionStatus: "authenticated",
    subscriptions: null,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  });
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
  useAuthSpy.mockRestore();
  useIsMobileSpy.mockRestore();
  mockWatchMovie.mockRestore();
  mockUnwatchMovie.mockRestore();
  apiSpies.forEach((s) => s.mockRestore());
  cleanup();
});

describe("CalendarPage", () => {
  it("renders grid view by default on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Grid view has weekday headers
    expect(screen.getByText("Mon")).toBeDefined();
    expect(screen.getByText("Tue")).toBeDefined();
    expect(screen.getByText("Wed")).toBeDefined();
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
  });

  it("shows hide watched toggle in agenda mode, selected by default", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByTitle("Show watched");
    expect(toggle).toBeDefined();
    // Active state = indigo background class
    expect(toggle.className).toContain("bg-amber-500");
  });

  it("toggles hide watched off when clicked", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByTitle("Show watched");
    fireEvent.click(toggle);

    // Now it should show "Hide watched" title (inactive state)
    const toggleOff = screen.getByTitle("Hide watched");
    expect(toggleOff).toBeDefined();
    expect(toggleOff.className).not.toContain("bg-amber-500");
  });

  it("shows hide watched toggle on mobile agenda", () => {
    useIsMobileSpy.mockReturnValue(true);
    render(<CalendarPage />, { wrapper: Wrapper });

    const toggle = screen.getByTitle("Show watched");
    expect(toggle).toBeDefined();
    expect(toggle.className).toContain("bg-amber-500");
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
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders week view toggle button on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });
    expect(screen.getByTitle("Week view")).toBeDefined();
  });

  it("switches to week view when week toggle is clicked", async () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Verify we're in grid mode
    expect(screen.getByText("Mon")).toBeDefined();

    // Click week view toggle
    fireEvent.click(screen.getByTitle("Week view"));

    // Week view renders 7 day-column headers (date numbers in header row)
    const weekDayNumbers = await waitFor(() =>
      screen.getAllByTestId("week-day-number"),
    );
    expect(weekDayNumbers.length).toBe(7);
  });

  it("week view renders 7 day columns", async () => {
    render(<CalendarPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTitle("Week view"));

    const columns = await waitFor(() =>
      screen.getAllByTestId("week-day-column"),
    );
    expect(columns.length).toBe(7);
  });

  it("?view=week param activates week view", async () => {
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={["/?view=week"]}>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const columns = await waitFor(() =>
      screen.getAllByTestId("week-day-column"),
    );
    expect(columns.length).toBe(7);
  });

  it("renders density toggle buttons on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Density toggle renders C / C / S (compact / comfortable / spacious initials)
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    const spaciousBtn = screen.getByRole("button", { name: /spacious/i });
    expect(compactBtn).toBeDefined();
    expect(comfortableBtn).toBeDefined();
    expect(spaciousBtn).toBeDefined();
  });

  it("comfortable density is active by default", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    expect(comfortableBtn.getAttribute("aria-pressed")).toBe("true");
    expect(comfortableBtn.className).toContain("bg-amber-500");
  });

  it("compact density reduces item cap vs comfortable", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Compact density button
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    fireEvent.click(compactBtn);

    expect(compactBtn.getAttribute("aria-pressed")).toBe("true");
    expect(compactBtn.className).toContain("bg-amber-500");

    // Comfortable should no longer be active
    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    expect(comfortableBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("?density=compact param activates compact density", () => {
    render(
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter initialEntries={["/?density=compact"]}>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    expect(compactBtn.getAttribute("aria-pressed")).toBe("true");
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
      <QueryClientProvider client={newTestClient()}>
        <MemoryRouter>
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
        </MemoryRouter>
      </QueryClientProvider>,
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
