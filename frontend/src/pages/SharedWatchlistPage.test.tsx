import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

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

const mockFetch = mock((_url: string, _init?: RequestInit) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ username: "testuser", titles: [makeTitle()] }),
  } as Response)
);

const { default: SharedWatchlistPage } = await import("./SharedWatchlistPage");

function Wrapper({ token = "abc123" }: { token?: string }) {
  return (
    <MemoryRouter initialEntries={[`/share/watchlist/${token}`]}>
      <Routes>
        <Route path="/share/watchlist/:token" element={<SharedWatchlistPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockImplementation((_url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ username: "testuser", titles: [makeTitle()] }),
    } as Response)
  );
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  // @ts-expect-error — restore to undefined so other test files are unaffected
  globalThis.fetch = undefined;
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
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ username: "emptyuser", titles: [] }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/this watchlist is empty/i)).toBeTruthy();
    });
  });

  it("shows error state when fetch throws", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.reject(new Error("Not found"))
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/invalid or has been revoked/i)).toBeTruthy();
    });
  });

  it("shows plural titles count correctly", async () => {
    mockFetch.mockImplementation((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            username: "multiuser",
            titles: [makeTitle({ id: "t1", title: "Movie A" }), makeTitle({ id: "t2", title: "Movie B" })],
          }),
      } as Response)
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/2 titles/i)).toBeTruthy();
    });
  });
});
