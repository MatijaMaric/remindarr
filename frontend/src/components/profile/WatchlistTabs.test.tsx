import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  renderHook,
} from "@testing-library/react";
import "../../i18n";
import WatchlistTabs, {
  resolveWatchlistTab,
  useWatchlistFilters,
  type WatchlistTab,
} from "./WatchlistTabs";
import type { Title } from "../../types";

afterEach(() => cleanup());

const emptyTitle: Partial<Title> = {
  offers: [],
  genres: [],
  is_tracked: true,
};

function show(
  id: string,
  user_status: Title["user_status"],
  show_status?: Title["show_status"],
): Title {
  return {
    ...emptyTitle,
    id,
    object_type: "SHOW",
    title: id,
    user_status: user_status ?? null,
    show_status: show_status ?? null,
  } as Title;
}

function movie(id: string): Title {
  return { ...emptyTitle, id, object_type: "MOVIE", title: id } as Title;
}

function makeCounts(
  overrides: Partial<Record<WatchlistTab, number>>,
): Record<WatchlistTab, number> {
  return {
    watching: 0,
    not_started: 0,
    completed: 0,
    plan_to_watch: 0,
    on_hold: 0,
    dropped: 0,
    unreleased: 0,
    movies: 0,
    ...overrides,
  };
}

describe("WatchlistTabs", () => {
  it("renders tabs that have titles, with their counts", () => {
    const counts = makeCounts({
      watching: 3,
      not_started: 5,
      completed: 2,
      dropped: 6,
      unreleased: 8,
      movies: 7,
    });
    render(
      <WatchlistTabs active="watching" onChange={() => {}} counts={counts} />,
    );
    expect(screen.getByTestId("tab-watching").textContent).toContain("3");
    expect(screen.getByTestId("tab-not_started").textContent).toBe(
      "Not started5",
    );
    expect(screen.getByTestId("tab-completed").textContent).toContain("2");
    expect(screen.getByTestId("tab-dropped").textContent).toContain("6");
    expect(screen.getByTestId("tab-unreleased").textContent).toBe(
      "Unreleased8",
    );
    expect(screen.getByTestId("tab-movies").textContent).toContain("7");
  });

  it("hides tabs with no titles", () => {
    render(
      <WatchlistTabs
        active="watching"
        onChange={() => {}}
        counts={makeCounts({ watching: 1, movies: 2 })}
      />,
    );
    expect(screen.queryByTestId("tab-plan_to_watch")).toBeNull();
    expect(screen.queryByTestId("tab-on_hold")).toBeNull();
    expect(screen.queryByTestId("tab-dropped")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("renders nothing when every tab is empty", () => {
    render(
      <WatchlistTabs
        active="watching"
        onChange={() => {}}
        counts={makeCounts({})}
      />,
    );
    expect(screen.queryByTestId("watchlist-tabs")).toBeNull();
  });

  it("calls onChange when a tab is clicked", () => {
    const onChange = mock<(t: WatchlistTab) => void>(() => {});
    render(
      <WatchlistTabs
        active="watching"
        onChange={onChange}
        counts={makeCounts({ watching: 1, completed: 1 })}
      />,
    );
    fireEvent.click(screen.getByTestId("tab-completed"));
    expect(onChange).toHaveBeenCalledWith("completed");
  });

  it("marks the active tab aria-selected=true", () => {
    render(
      <WatchlistTabs
        active="completed"
        onChange={() => {}}
        counts={makeCounts({ watching: 1, completed: 1 })}
      />,
    );
    expect(
      screen.getByTestId("tab-completed").getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByTestId("tab-watching").getAttribute("aria-selected"),
    ).toBe("false");
  });
});

describe("resolveWatchlistTab", () => {
  it("keeps the active tab when it has titles", () => {
    expect(
      resolveWatchlistTab(
        "completed",
        makeCounts({ watching: 1, completed: 1 }),
      ),
    ).toBe("completed");
  });

  it("falls back to the first tab with titles", () => {
    expect(resolveWatchlistTab("watching", makeCounts({ movies: 3 }))).toBe(
      "movies",
    );
  });
});

describe("useWatchlistFilters", () => {
  it("puts every show in exactly one tab", () => {
    const shows = [
      show("a", "watching"),
      show("b", null, "caught_up"), // falls through to show_status
      show("c", "completed"),
      show("d", "plan_to_watch"),
      show("e", "on_hold"),
      show("f", "dropped"),
      show("g", null, "not_started"),
      show("h", null, "unreleased"),
      show("i", null, null), // no computable status
    ];
    const movies = [movie("m1"), movie("m2")];
    const { result } = renderHook(() => useWatchlistFilters(shows, movies));
    const { counts, lists } = result.current;
    expect(counts).toEqual({
      watching: 3, // watching + caught_up + no status
      not_started: 1,
      completed: 1,
      plan_to_watch: 1,
      on_hold: 1,
      dropped: 1,
      unreleased: 1,
      movies: 2,
    });
    expect(lists.watching.map((s: Title) => s.id)).toEqual(["a", "b", "i"]);
    const showTotal = Object.entries(counts)
      .filter(([k]) => k !== "movies")
      .reduce((n, [, v]) => n + v, 0);
    expect(showTotal).toBe(shows.length);
  });
});
