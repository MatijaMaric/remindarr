import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../i18n";
import { apiMock, resetApiMock } from "../test-utils/apiMock";

import type { SharedWatchlistTitle } from "../api";
import { ApiError } from "../lib/api-error";

function makeTitle(
  overrides: Partial<SharedWatchlistTitle> = {},
): SharedWatchlistTitle {
  return {
    id: "title-1",
    object_type: "MOVIE",
    title: "Test Movie",
    release_year: 2023,
    poster_url: "/poster.jpg",
    ...overrides,
  };
}

const { default: SharedWatchlistPage } = await import("./SharedWatchlistPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ token = "abc123" }: { token?: string }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[`/share/watchlist/${token}`]}>
        <Routes>
          <Route
            path="/share/watchlist/:token"
            element={<SharedWatchlistPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiMock.getSharedWatchlist.mockImplementation(() =>
    Promise.resolve({ username: "testuser", titles: [makeTitle()] }),
  );
});

afterEach(() => {
  cleanup();
  resetApiMock();
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
    apiMock.getSharedWatchlist.mockImplementation(() =>
      Promise.resolve({ username: "emptyuser", titles: [] }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/this watchlist is empty/i)).toBeTruthy();
    });
  });

  it("shows error state when fetch throws (after one retry)", async () => {
    apiMock.getSharedWatchlist.mockImplementation(() =>
      Promise.reject(new Error("Network down")),
    );
    render(<Wrapper />);
    await waitFor(
      () => {
        expect(screen.getByText(/invalid or has been revoked/i)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(apiMock.getSharedWatchlist).toHaveBeenCalledTimes(2);
  });

  it("does not retry a revoked link (404)", async () => {
    apiMock.getSharedWatchlist.mockImplementation(() =>
      Promise.reject(new ApiError("Not found", 404)),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/invalid or has been revoked/i)).toBeTruthy();
    });
    expect(apiMock.getSharedWatchlist).toHaveBeenCalledTimes(1);
  });

  it("shows plural titles count correctly", async () => {
    apiMock.getSharedWatchlist.mockImplementation(() =>
      Promise.resolve({
        username: "multiuser",
        titles: [
          makeTitle({ id: "t1", title: "Movie A" }),
          makeTitle({ id: "t2", title: "Movie B" }),
        ],
      }),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/2 titles/i)).toBeTruthy();
    });
  });
});
