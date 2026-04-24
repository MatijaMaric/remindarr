import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup, renderHook } from "@testing-library/react";
import "../../i18n";
import WatchlistTabs, {
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

function show(id: string, user_status: Title["user_status"], show_status?: Title["show_status"]): Title {
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

describe("WatchlistTabs", () => {
  it("renders the 5 tabs with their counts", () => {
    const counts: Record<WatchlistTab, number> = {
      watching: 3,
      completed: 2,
      plan_to_watch: 1,
      on_hold: 4,
      movies: 7,
    };
    render(<WatchlistTabs active="watching" onChange={() => {}} counts={counts} />);
    expect(screen.getByTestId("tab-watching").textContent).toContain("3");
    expect(screen.getByTestId("tab-completed").textContent).toContain("2");
    expect(screen.getByTestId("tab-plan_to_watch").textContent).toContain("1");
    expect(screen.getByTestId("tab-on_hold").textContent).toContain("4");
    expect(screen.getByTestId("tab-movies").textContent).toContain("7");
  });

  it("calls onChange when a tab is clicked", () => {
    const onChange = mock<(t: WatchlistTab) => void>(() => {});
    const counts: Record<WatchlistTab, number> = {
      watching: 1, completed: 1, plan_to_watch: 1, on_hold: 1, movies: 1,
    };
    render(<WatchlistTabs active="watching" onChange={onChange} counts={counts} />);
    fireEvent.click(screen.getByTestId("tab-completed"));
    expect(onChange).toHaveBeenCalledWith("completed");
  });

  it("marks the active tab aria-selected=true", () => {
    const counts: Record<WatchlistTab, number> = {
      watching: 1, completed: 1, plan_to_watch: 1, on_hold: 1, movies: 1,
    };
    render(<WatchlistTabs active="completed" onChange={() => {}} counts={counts} />);
    expect(screen.getByTestId("tab-completed").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("tab-watching").getAttribute("aria-selected")).toBe("false");
  });
});

describe("useWatchlistFilters", () => {
  it("groups shows and movies by status", () => {
    const shows = [
      show("a", "watching"),
      show("b", null, "caught_up"), // falls through to show_status
      show("c", "completed"),
      show("d", "plan_to_watch"),
      show("e", "on_hold"),
    ];
    const movies = [movie("m1"), movie("m2")];
    const { result } = renderHook(() => useWatchlistFilters(shows, movies));
    expect(result.current.counts.watching).toBe(2); // watching + caught_up
    expect(result.current.counts.completed).toBe(1);
    expect(result.current.counts.plan_to_watch).toBe(1);
    expect(result.current.counts.on_hold).toBe(1);
    expect(result.current.counts.movies).toBe(2);
    expect(result.current.lists.watching.map((s: Title) => s.id)).toEqual(["a", "b"]);
  });
});
