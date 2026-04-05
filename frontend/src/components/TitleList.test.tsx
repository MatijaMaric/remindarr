import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TitleList from "./TitleList";
import { AuthContext } from "../context/AuthContext";
import * as api from "../api";
import type { Title } from "../types";
import type { ReactNode } from "react";

const mockAuthValue = {
  user: null,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthContext value={mockAuthValue as any}>{children}</AuthContext>
    </MemoryRouter>
  );
}

function makeTitle(id: string, overrides: Partial<Title> = {}): Title {
  return {
    id,
    object_type: "MOVIE",
    title: `Title ${id}`,
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-15",
    runtime_minutes: 120,
    short_description: "A test movie",
    genres: ["Action"],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: "en",
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: false,
    offers: [],
    ...overrides,
  };
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "trackTitle").mockResolvedValue(undefined as any),
    spyOn(api, "untrackTitle").mockResolvedValue(undefined as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("TitleList", () => {
  it("renders all titles when no maxRows", () => {
    const titles = Array.from({ length: 10 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} />, { wrapper: Wrapper });

    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(`Title movie-${i}`)).toBeDefined();
    }
  });

  it("renders empty message when no titles", () => {
    render(<TitleList titles={[]} emptyMessage="Nothing here" />, { wrapper: Wrapper });
    expect(screen.getByText("Nothing here")).toBeDefined();
  });

  it("limits to maxRows * 6 items when maxRows is set", () => {
    const titles = Array.from({ length: 10 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} />, { wrapper: Wrapper });

    // maxRows=1 means 6 items (xl breakpoint = 6 columns)
    for (let i = 0; i < 6; i++) {
      expect(screen.getByText(`Title movie-${i}`)).toBeDefined();
    }
    // Items beyond 6 should not be rendered
    expect(screen.queryByText("Title movie-6")).toBeNull();
    expect(screen.queryByText("Title movie-7")).toBeNull();
  });

  it("shows all items if fewer than maxRows * 6", () => {
    const titles = Array.from({ length: 4 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} />, { wrapper: Wrapper });

    for (let i = 0; i < 4; i++) {
      expect(screen.getByText(`Title movie-${i}`)).toBeDefined();
    }
  });

  it("does not show View all link when not truncated", () => {
    const titles = Array.from({ length: 4 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} viewAllHref="/all" />, { wrapper: Wrapper });

    expect(screen.queryByText("View all")).toBeNull();
  });

  it("shows View all link when truncated and viewAllHref is provided", () => {
    const titles = Array.from({ length: 10 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} viewAllHref="/all" />, { wrapper: Wrapper });

    const link = screen.getByText("View all");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/all");
  });

  it("uses custom viewAllLabel when provided", () => {
    const titles = Array.from({ length: 10 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} viewAllHref="/all" viewAllLabel="Show more" />, { wrapper: Wrapper });

    expect(screen.getByText("Show more")).toBeDefined();
  });

  it("does not show View all link when truncated but no viewAllHref", () => {
    const titles = Array.from({ length: 10 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} />, { wrapper: Wrapper });

    expect(screen.queryByText("View all")).toBeNull();
  });

  it("limits to maxRows * 6 items with maxRows=2", () => {
    const titles = Array.from({ length: 15 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={2} />, { wrapper: Wrapper });

    // maxRows=2 means 12 items
    for (let i = 0; i < 12; i++) {
      expect(screen.getByText(`Title movie-${i}`)).toBeDefined();
    }
    expect(screen.queryByText("Title movie-12")).toBeNull();
  });

  it("renders normal grid for lists at or below the virtual threshold (24 items)", () => {
    const titles = Array.from({ length: 24 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} />, { wrapper: Wrapper });

    expect(screen.getByTestId("title-grid")).toBeDefined();
    expect(screen.queryByTestId("virtual-list")).toBeNull();
    // All items should be in the DOM
    for (let i = 0; i < 24; i++) {
      expect(screen.getByText(`Title movie-${i}`)).toBeDefined();
    }
  });

  it("renders virtual list container for lists above the virtual threshold (>24 items)", () => {
    const titles = Array.from({ length: 30 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} />, { wrapper: Wrapper });

    expect(screen.getByTestId("virtual-list")).toBeDefined();
    expect(screen.queryByTestId("title-grid")).toBeNull();
  });

  it("does not virtualize when maxRows is set even if count exceeds threshold", () => {
    const titles = Array.from({ length: 30 }, (_, i) => makeTitle(`movie-${i}`));
    render(<TitleList titles={titles} maxRows={1} />, { wrapper: Wrapper });

    // maxRows forces normal grid path (and also truncates to 6)
    expect(screen.getByTestId("title-grid")).toBeDefined();
    expect(screen.queryByTestId("virtual-list")).toBeNull();
  });
});
