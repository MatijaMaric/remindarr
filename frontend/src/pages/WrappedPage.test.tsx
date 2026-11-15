import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../i18n";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import type { YearInReview } from "../types";

const baseReview: YearInReview = {
  year: 2025,
  movies_watched: 4,
  episodes_watched: 12,
  watch_time_minutes: 600,
  top_genres: [{ genre: "Drama", count: 3 }],
  top_providers: [{ provider_id: 8, name: "Netflix", count: 2 }],
  top_shows: [
    {
      title_id: "show-1",
      title: "The Bear",
      poster_url: "/bear.jpg",
      count: 8,
    },
  ],
  longest_binge: {
    title_id: "show-1",
    title: "The Bear",
    poster_url: "/bear.jpg",
    days: 3,
    episodes: 6,
  },
  most_rewatched: {
    title_id: "movie-1",
    title: "Dune",
    poster_url: "/dune.jpg",
    rewatches: 3,
  },
  first_watch: {
    title_id: "movie-2",
    title: "First Film",
    poster_url: null,
    watched_at: "2025-01-05 08:00:00",
  },
  last_watch: {
    title_id: "movie-3",
    title: "Last Film",
    poster_url: null,
    watched_at: "2025-12-20 22:00:00",
  },
  years: [2025],
};

apiMock.getYearInReview.mockImplementation(() => Promise.resolve(baseReview));

const emptyReview: YearInReview = {
  ...baseReview,
  movies_watched: 0,
  episodes_watched: 0,
  watch_time_minutes: 0,
  top_genres: [],
  top_providers: [],
  top_shows: [],
  longest_binge: null,
  most_rewatched: null,
  first_watch: null,
  last_watch: null,
};

const { default: WrappedPage } = await import("./WrappedPage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/wrapped/2025"]}>
        <Routes>
          <Route path="/wrapped/:year" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  resetApiMock();
  apiMock.getYearInReview.mockImplementation(() => Promise.resolve(baseReview));
});

describe("WrappedPage", () => {
  it("explains omitted unknown episode durations", async () => {
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.resolve({ ...baseReview, watch_time_unknown_episodes: 2 }),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(
        screen.getByText(
          "2 watched episodes have unknown duration; time totals exclude them.",
        ),
      ).toBeDefined(),
    );
  });

  it("renders headline stats from the year-in-review payload", async () => {
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getAllByText("The Bear").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("10h")).toBeDefined();
    expect(screen.getByText("Drama")).toBeDefined();
    expect(screen.getByText("Netflix")).toBeDefined();
    expect(screen.getByText("Dune")).toBeDefined();
    expect(screen.getByText("First Film")).toBeDefined();
    expect(screen.getByText("Last Film")).toBeDefined();
  });

  it("shows an error when the request fails", async () => {
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.reject(new Error("nope")),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(
        screen.getByText("Failed to load Year in Review. Please try again."),
      ).toBeDefined();
    });
  });

  it("shows an empty state when there is no watch data", async () => {
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.resolve(emptyReview),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText("No watches logged in 2025.")).toBeDefined();
    });
  });

  it("labels counts with their units", async () => {
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("8 episodes")).toBeDefined());
    expect(screen.getByText("Rewatched 3 times")).toBeDefined();
    expect(screen.getByText("Streaming on")).toBeDefined();
    expect(screen.getByText("3 days · 6 episodes")).toBeDefined();
  });

  // Regression: sparse years showed the same title as First and Last watch
  // and a "1 days · 1 episodes" Longest binge.
  it("hides a Last watch equal to First watch and one-day binges", async () => {
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.resolve({
        ...baseReview,
        last_watch: { ...baseReview.first_watch!, watched_at: "2025-02-01" },
        longest_binge: { ...baseReview.longest_binge!, days: 1, episodes: 1 },
      }),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("First watch")).toBeDefined());
    expect(screen.queryByText("Last watch")).toBeNull();
    expect(screen.queryByText("Longest binge")).toBeNull();
  });

  it("explains link scope and offers Revoke only once a link exists", async () => {
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Dune")).toBeDefined());
    expect(screen.queryByText(/This link shows only/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke link" })).toBeNull();

    cleanup();
    apiMock.getWrappedShareToken.mockImplementation(() =>
      Promise.resolve({ token: "aabbccddeeff00112233445566778899" }),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Revoke link" })).toBeDefined(),
    );
    expect(
      screen.getByText(
        "This link shows only your 2025 review. Watchlist links stay separate.",
      ),
    ).toBeDefined();
  });

  it("disables Share for an empty or failed year", async () => {
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.resolve(emptyReview),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText("No watches logged in 2025.")).toBeDefined(),
    );
    const share = screen.getByRole("button", {
      name: "Share",
    }) as HTMLButtonElement;
    expect(share.disabled).toBe(true);

    cleanup();
    apiMock.getYearInReview.mockImplementation(() =>
      Promise.reject(new Error("nope")),
    );
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(
        screen.getByText("Failed to load Year in Review. Please try again."),
      ).toBeDefined(),
    );
    expect(
      (screen.getByRole("button", { name: "Share" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("enables Share once a year with watches has loaded", async () => {
    render(<WrappedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Dune")).toBeDefined());
    expect(
      (screen.getByRole("button", { name: "Share" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
