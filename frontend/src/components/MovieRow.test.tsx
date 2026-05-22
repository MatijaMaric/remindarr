import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import MovieRow from "./MovieRow";

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

let mockWatchMovie: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockWatchMovie = spyOn(api, "watchMovie").mockResolvedValue(
    undefined as never,
  );
});

afterEach(() => {
  cleanup();
  mockWatchMovie.mockRestore();
});

const releasedMovie = {
  id: "m-1",
  title: "Dune: Part Two",
  release_date: "2024-03-01",
  release_year: 2024,
  poster_url: null,
  offers: [],
};

const upcomingMovie = {
  id: "m-2",
  title: "Mickey 17",
  release_date: "2099-03-25",
  release_year: 2099,
  poster_url: null,
  offers: [],
};

function renderRow(
  variant: "to_watch" | "upcoming",
  movies: (typeof releasedMovie)[],
) {
  return render(<MovieRow variant={variant} movies={movies} />, {
    wrapper: Wrapper,
  });
}

describe("MovieRow — to_watch variant", () => {
  it("renders the movie title", () => {
    renderRow("to_watch", [releasedMovie]);
    expect(screen.getByText("Dune: Part Two")).toBeTruthy();
  });

  it("renders a watched action button for each movie", () => {
    renderRow("to_watch", [releasedMovie]);
    const btn = screen.getByRole("button", { name: /mark watched/i });
    expect(btn).toBeTruthy();
  });

  it("calls api.watchMovie when the watched button is clicked", async () => {
    renderRow("to_watch", [releasedMovie]);
    const btn = screen.getByRole("button", { name: /mark watched/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mockWatchMovie).toHaveBeenCalledTimes(1);
    expect(mockWatchMovie).toHaveBeenCalledWith("m-1");
  });

  it("optimistically removes the movie from the list after clicking watched", async () => {
    renderRow("to_watch", [releasedMovie]);
    const btn = screen.getByRole("button", { name: /mark watched/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.queryByText("Dune: Part Two")).toBeNull();
  });

  it("renders empty state when no movies", () => {
    renderRow("to_watch", []);
    expect(screen.queryByRole("button", { name: /mark watched/i })).toBeNull();
  });
});

describe("MovieRow — upcoming variant", () => {
  it("renders the movie title", () => {
    renderRow("upcoming", [upcomingMovie]);
    expect(screen.getByText("Mickey 17")).toBeTruthy();
  });

  it("does NOT render a watched action button", () => {
    renderRow("upcoming", [upcomingMovie]);
    expect(screen.queryByRole("button", { name: /mark watched/i })).toBeNull();
  });

  it("renders the release date", () => {
    const { container } = renderRow("upcoming", [upcomingMovie]);
    expect(container.textContent).toContain("2099");
  });
});
