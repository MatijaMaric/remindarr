import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../i18n";

import type { Title } from "../types";

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    object_type: "MOVIE",
    title: "Test Movie",
    original_title: null,
    release_year: 2023,
    release_date: "2023-06-01",
    runtime_minutes: 120,
    short_description: "A test movie",
    genres: ["Action"],
    imdb_id: null,
    tmdb_id: "12345",
    poster_url: "/poster.jpg",
    age_certification: null,
    original_language: "en",
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    ...overrides,
  };
}

const mockGetSharedWatchlist = mock(() =>
  Promise.resolve({ username: "testuser", titles: [makeTitle()] })
);

mock.module("../api", () => ({
  getSharedWatchlist: mockGetSharedWatchlist,
}));

const { default: SharedWatchlistPage } = await import("./SharedWatchlistPage");

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ token = "abc123" }: { token?: string }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[`/share/watchlist/${token}`]}>
        <Routes>
          <Route path="/share/watchlist/:token" element={<SharedWatchlistPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockGetSharedWatchlist.mockImplementation(() =>
    Promise.resolve({ username: "testuser", titles: [makeTitle()] })
  );
});

afterEach(() => {
  cleanup();
  mockGetSharedWatchlist.mockReset();
});

describe("SharedWatchlistPage", () => {
  it("renders title count and username when API returns data", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/1 title/i)).toBeTruthy();
      expect(screen.getByText(/@testuser/i)).toBeTruthy();
    });
  });

  it("renders poster for each title", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByAltText("Test Movie")).toBeTruthy();
    });
  });

  it("shows 'This watchlist is empty' when titles array is empty", async () => {
    mockGetSharedWatchlist.mockImplementation(() =>
      Promise.resolve({ username: "emptyuser", titles: [] })
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/this watchlist is empty/i)).toBeTruthy();
    });
  });

  it("shows error state when fetch throws", async () => {
    mockGetSharedWatchlist.mockImplementation(() =>
      Promise.reject(new Error("Not found"))
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/invalid or has been revoked/i)).toBeTruthy();
    });
  });

  it("shows plural titles count correctly", async () => {
    mockGetSharedWatchlist.mockImplementation(() =>
      Promise.resolve({
        username: "multiuser",
        titles: [makeTitle({ id: "t1", title: "Movie A" }), makeTitle({ id: "t2", title: "Movie B" })],
      })
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/2 titles/i)).toBeTruthy();
    });
  });
});
