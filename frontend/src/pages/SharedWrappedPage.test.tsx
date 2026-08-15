import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import type { SharedYearInReview } from "../types";

const review: SharedYearInReview = {
  username: "ada",
  year: 2025,
  movies_watched: 2,
  episodes_watched: 4,
  watch_time_minutes: 180,
  watch_time_minutes_movies: 120,
  watch_time_minutes_shows: 60,
  top_genres: [],
  top_providers: [],
  top_shows: [
    { title_id: "s1", title: "Severance", poster_url: null, count: 4 },
  ],
  longest_binge: null,
  most_rewatched: null,
  first_watch: null,
  last_watch: null,
  years: [2025],
};

const { default: SharedWrappedPage } = await import("./SharedWrappedPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ token = "aabbccddeeff00112233445566778899" } = {}) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[`/share/wrapped/${token}/2025`]}>
        <Routes>
          <Route
            path="/share/wrapped/:token/:year"
            element={<SharedWrappedPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiMock.getSharedWrapped.mockImplementation(() => Promise.resolve(review));
});

afterEach(() => {
  cleanup();
  resetApiMock();
});

describe("SharedWrappedPage", () => {
  it("renders the shared username and top show", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/@ada/)).toBeTruthy();
      expect(screen.getByText("Severance")).toBeTruthy();
    });
  });

  it("renders an invalid-link message when the API fails", async () => {
    apiMock.getSharedWrapped.mockImplementation(() =>
      Promise.reject(new Error("404")),
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(
        screen.getByText("This link is invalid or has been revoked"),
      ).toBeTruthy();
    });
  });
});
