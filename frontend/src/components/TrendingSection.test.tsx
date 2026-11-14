import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import TrendingSection from "./TrendingSection";
import type { TrendingTitle, TrendingPerson } from "../types";

// FullBleedCarousel observes its scroll container; happy-dom lacks ResizeObserver.
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

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

const movie: TrendingTitle = {
  id: "movie-1",
  objectType: "MOVIE",
  title: "Trending Movie",
  posterUrl: "https://image.tmdb.org/t/p/w342/poster.jpg",
  releaseDate: "2026-01-01",
  isTracked: false,
};

const show: TrendingTitle = {
  id: "tv-2",
  objectType: "SHOW",
  title: "Trending Show",
  posterUrl: "https://image.tmdb.org/t/p/w342/show.jpg",
  releaseDate: null,
  isTracked: false,
};

const movieNoPoster: TrendingTitle = {
  ...movie,
  id: "movie-5",
  title: "No Poster Movie",
  posterUrl: null,
};

const person: TrendingPerson = {
  id: 3,
  name: "Trending Actor",
  profileUrl: "https://image.tmdb.org/t/p/w185/actor.jpg",
  knownForDepartment: "Acting",
};

const personNoPhoto: TrendingPerson = {
  id: 4,
  name: "Zelda Nophoto",
  profileUrl: null,
  knownForDepartment: null,
};

afterEach(() => cleanup());

describe("TrendingSection — titles (US1)", () => {
  it("renders movies, shows and people in one row, titles interleaved by rank", () => {
    const { container } = render(
      <TrendingSection
        movies={[movie, movieNoPoster]}
        shows={[show]}
        people={[person]}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Trending Now")).toBeTruthy();
    expect(screen.queryByText("Movies")).toBeNull();
    expect(screen.queryByText("TV Shows")).toBeNull();
    expect(screen.queryByText("People")).toBeNull();
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect([...new Set(hrefs)]).toEqual([
      "/title/movie-1",
      "/title/tv-2",
      "/title/movie-5",
      "/person/3",
    ]);
  });

  it("links a title to its detail view /title/:id", () => {
    render(<TrendingSection movies={[movie]} shows={[]} people={[]} />, {
      wrapper: Wrapper,
    });
    const link = screen.getByText("Trending Movie").closest("a");
    expect(link?.getAttribute("href")).toBe("/title/movie-1");
  });

  it("renders a placeholder (no <img>) when a poster is missing", () => {
    const { container } = render(
      <TrendingSection movies={[movieNoPoster]} shows={[]} people={[]} />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("No Poster Movie")).toBeTruthy();
  });

  it("leaves out titles the viewer already tracks", () => {
    render(
      <TrendingSection
        movies={[{ ...movie, isTracked: true }]}
        shows={[show]}
        people={[]}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText("Trending Movie")).toBeNull();
    expect(screen.getByText("Trending Show")).toBeTruthy();
  });

  it("hides the section when every trending title is already tracked", () => {
    const { container } = render(
      <TrendingSection
        movies={[{ ...movie, isTracked: true }]}
        shows={[]}
        people={[]}
      />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector("section")).toBeNull();
  });
});

describe("TrendingSection — people (US2)", () => {
  it("renders person rows with name and department", () => {
    render(<TrendingSection movies={[]} shows={[]} people={[person]} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Trending Actor")).toBeTruthy();
    expect(screen.getByText("Acting")).toBeTruthy();
  });

  it("links a person to /person/:id", () => {
    render(<TrendingSection movies={[]} shows={[]} people={[person]} />, {
      wrapper: Wrapper,
    });
    const link = screen.getByText("Trending Actor").closest("a");
    expect(link?.getAttribute("href")).toBe("/person/3");
  });

  it("renders a placeholder (no <img>) when a profile photo is missing", () => {
    const { container } = render(
      <TrendingSection movies={[]} shows={[]} people={[personNoPhoto]} />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector("img")).toBeNull();
    // Placeholder is the first letter of the name
    expect(screen.getByText("Z")).toBeTruthy();
  });
});

describe("TrendingSection — loading & empty states (US3)", () => {
  it("renders a non-blocking loading placeholder that does not block siblings", () => {
    const { container } = render(
      <>
        <TrendingSection movies={[]} shows={[]} people={[]} isLoading />
        <div>Sibling content</div>
      </>,
      { wrapper: Wrapper },
    );
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull();
    // Siblings still render — trending never blocks the rest of home (FR-009).
    expect(screen.getByText("Sibling content")).toBeTruthy();
  });

  it("hides the whole section when all groups are empty and not loading", () => {
    const { container } = render(
      <TrendingSection movies={[]} shows={[]} people={[]} />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByText("Trending Now")).toBeNull();
  });
});
