import {
  describe,
  test,
  expect,
  afterEach,
  mock,
  beforeEach,
  spyOn,
} from "bun:test";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";

// Mock i18n before anything
import "../i18n";

const {
  default: AgendaCalendar,
  dropPremiereDuplicates,
  pickShowEpisode,
} = await import("./AgendaCalendar");

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

function ep(
  id: number,
  titleId: string,
  airDate: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title_id: titleId,
    season_number: 1,
    episode_number: id,
    name: `Episode ${id}`,
    overview: null,
    air_date: airDate,
    still_path: null,
    show_title: `Show ${titleId}`,
    poster_url: null,
    is_watched: false,
    offers: [],
    ...extra,
  } as any;
}

function title(
  id: string,
  objectType: "MOVIE" | "SHOW",
  releaseDate: string,
  name = id,
) {
  return {
    id,
    object_type: objectType,
    title: name,
    release_date: releaseDate,
    poster_url: null,
    age_certification: null,
    offers: [],
  } as any;
}

function thisMonth(offset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;
let apiSpies: ReturnType<typeof spyOn>[];

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: {
      id: "u1",
      username: "me",
      display_name: "Me",
      auth_provider: "local",
      is_admin: false,
    },
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
  apiSpies = [
    spyOn(api, "getCalendarTitles").mockResolvedValue({
      titles: [],
      episodes: [],
    } as any),
    spyOn(api, "getCrowdedWeekSettings").mockResolvedValue({
      crowdedWeekThreshold: 5,
      crowdedWeekBadgeEnabled: 1,
    } as any),
    spyOn(api, "watchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "unwatchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "watchEpisodesBulk").mockResolvedValue(undefined as any),
    spyOn(api, "watchMovie").mockResolvedValue(undefined as any),
    spyOn(api, "unwatchMovie").mockResolvedValue(undefined as any),
    spyOn(api, "getSubscriptions").mockResolvedValue({
      providerIds: [],
    } as any),
  ];
});

afterEach(() => {
  useAuthSpy.mockRestore();
  apiSpies.forEach((s) => s.mockRestore());
  cleanup();
});

describe("AgendaCalendar", () => {
  test("renders without crashing with mocked api", async () => {
    const searchParams = new URLSearchParams();
    const setSearchParams = mock(() => {});

    const { container } = render(
      <AgendaCalendar
        searchParams={searchParams}
        setSearchParams={setSearchParams as any}
      />,
      { wrapper: Wrapper },
    );

    // Component renders something (even if just a loading state)
    expect(container).toBeDefined();
  });
});

describe("dropPremiereDuplicates", () => {
  test("drops a show title on the day its own episode airs", () => {
    const titles = [title("tv-1", "SHOW", "2026-08-16")];
    const episodes = [ep(1, "tv-1", "2026-08-16")];
    expect(dropPremiereDuplicates(titles, episodes)).toEqual([]);
  });

  test("keeps a show title with no episode that day, and every movie", () => {
    const titles = [
      title("tv-1", "SHOW", "2026-08-16"),
      title("movie-1", "MOVIE", "2026-08-16"),
    ];
    const episodes = [
      ep(1, "tv-1", "2026-08-17"),
      ep(2, "movie-1", "2026-08-16"),
    ];
    expect(dropPremiereDuplicates(titles, episodes).map((t) => t.id)).toEqual([
      "tv-1",
      "movie-1",
    ]);
  });
});

describe("pickShowEpisode", () => {
  test("prefers the first unwatched episode, else the first", () => {
    const watched = ep(1, "tv-1", "2026-08-13", { is_watched: true });
    const unwatched = ep(2, "tv-1", "2026-08-13");
    expect(pickShowEpisode([watched, unwatched]).id).toBe(2);
    expect(pickShowEpisode([watched]).id).toBe(1);
  });
});

describe("AgendaCalendar layout and paging", () => {
  function renderAgenda(params = "") {
    return render(
      <AgendaCalendar
        searchParams={new URLSearchParams(params)}
        setSearchParams={mock(() => {}) as any}
      />,
      { wrapper: Wrapper },
    );
  }

  test("draws one card per show per day, with its episode count", async () => {
    const day = `${thisMonth()}-10`;
    apiSpies[0].mockImplementation((async ({ month }: { month: string }) =>
      month === thisMonth()
        ? {
            titles: [],
            episodes: [
              ep(1, "tv-1", day),
              ep(2, "tv-1", day),
              ep(3, "tv-1", day),
              ep(4, "tv-2", day),
            ],
          }
        : { titles: [], episodes: [] }) as any);

    renderAgenda();

    const cards = await screen.findAllByTestId("agenda-show-card");
    expect(cards.length).toBe(2);
    expect(screen.getByText("3 Episodes")).toBeDefined();
    expect(screen.getByText("2 items")).toBeDefined();
  });

  test("shows releases as compact rows and drops the premiere duplicate", async () => {
    const day = `${thisMonth()}-12`;
    apiSpies[0].mockImplementation((async ({ month }: { month: string }) =>
      month === thisMonth()
        ? {
            titles: [
              title("movie-1", "MOVIE", day, "Big Movie"),
              title("tv-9", "SHOW", day, "Show tv-9"),
            ],
            episodes: [ep(9, "tv-9", day)],
          }
        : { titles: [], episodes: [] }) as any);

    renderAgenda();

    const rows = await screen.findAllByTestId("agenda-title-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("Big Movie");
    expect(rows[0].textContent).toContain("Movie");
    expect(rows[0].getAttribute("href")).toBe("/title/movie-1");
    expect(screen.getAllByTestId("agenda-show-card").length).toBe(1);
  });

  test("starts on the month in ?month= instead of today", async () => {
    renderAgenda("month=2024-03");
    await waitFor(() => expect(apiSpies[0]).toHaveBeenCalledTimes(3));
    const months = apiSpies[0].mock.calls.map((c: any[]) => c[0].month).sort();
    expect(months).toEqual(["2024-02", "2024-03", "2024-04"]);
  });

  test("earlier and later buttons each load one more month", async () => {
    renderAgenda("month=2024-03");
    const earlier = await screen.findByRole("button", {
      name: `Show ${new Date(2024, 0, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
    });
    const later = screen.getByRole("button", {
      name: `Show ${new Date(2024, 4, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
    });

    fireEvent.click(later);
    await waitFor(() => expect(apiSpies[0]).toHaveBeenCalledTimes(4));
    expect(apiSpies[0].mock.calls[3][0].month).toBe("2024-05");
    await waitFor(() => expect(earlier.hasAttribute("disabled")).toBe(false));

    fireEvent.click(earlier);
    await waitFor(() => expect(apiSpies[0]).toHaveBeenCalledTimes(5));
    expect(apiSpies[0].mock.calls[4][0].month).toBe("2024-01");

    // No request happens without a click.
    await new Promise((r) => setTimeout(r, 50));
    expect(apiSpies[0]).toHaveBeenCalledTimes(5);
  });
});
