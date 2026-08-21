import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { apiMock, resetApiMock } from "../../test-utils/apiMock";
import "../../i18n";
import type { ShowDetailsResponse, Title } from "../../types";

const MockAuthContext = createContext<Record<string, unknown> | null>(null);

let mockUser: { id: string } | null = { id: "user1" };

// Real React context so this file does not leak a broken AuthContext mock.
mock.module("../../context/AuthContext", () => ({
  useAuth: () =>
    useContext(MockAuthContext) ?? {
      user: mockUser,
      loading: false,
      sessionStatus: mockUser ? "authenticated" : "unauthenticated",
    },
  AuthContext: MockAuthContext,
}));

const { default: ShowDetail } = await import("./ShowDetail");
const { AuthContext } = await import("../../context/AuthContext");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <AuthContext
        value={{
          user: mockUser,
          loading: false,
          sessionStatus: mockUser ? "authenticated" : "unauthenticated",
          providers: null,
          login: mock(() => Promise.resolve()),
          signup: mock(() => Promise.resolve()),
          logout: mock(() => Promise.resolve()),
          refresh: mock(() => Promise.resolve()),
        }}
      >
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext>
    </QueryClientProvider>
  );
}

const title: Title = {
  id: "tv-100",
  object_type: "SHOW",
  title: "Test Show",
  original_title: null,
  release_year: 2024,
  release_date: "2024-01-01",
  runtime_minutes: null,
  short_description: "A show",
  genres: [],
  imdb_id: null,
  tmdb_id: "100",
  poster_url: null,
  age_certification: null,
  original_language: "en",
  tmdb_url: null,
  imdb_score: null,
  imdb_votes: null,
  tmdb_score: null,
  is_tracked: false,
  offers: [],
};

function showData(
  overrides: Partial<ShowDetailsResponse> = {},
): ShowDetailsResponse {
  return {
    title,
    country: "US",
    tmdb: {
      id: 100,
      name: "Test Show",
      original_name: "Test Show",
      overview: "Overview",
      tagline: "",
      first_air_date: "2024-01-01",
      last_air_date: "2024-03-01",
      status: "Ended",
      type: "Scripted",
      number_of_seasons: 2,
      number_of_episodes: 10,
      episode_run_time: [45],
      original_language: "en",
      genres: [],
      created_by: [],
      networks: [],
      production_companies: [],
      production_countries: [],
      spoken_languages: [],
      seasons: [
        {
          id: 1,
          name: "Season 1",
          overview: "",
          air_date: "2024-01-01",
          episode_count: 5,
          poster_path: null,
          season_number: 1,
          vote_average: 8,
        },
      ],
      poster_path: null,
      backdrop_path: null,
      vote_average: 8,
      vote_count: 1,
      credits: { cast: [], crew: [] },
      content_ratings: { results: [] },
      "watch/providers": { results: {} },
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  resetApiMock();
  mockUser = { id: "user1" };
});

beforeEach(() => {
  apiMock.getTitleRating.mockResolvedValue({
    user_rating: null,
    aggregated: { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 },
    friends_ratings: [],
  });
});

describe("ShowDetail pacing sparkline", () => {
  it("renders an aggregate sparkline across rated seasons", async () => {
    apiMock.getShowEpisodeRatings.mockResolvedValue({
      user_ratings: [
        { season: 1, episode: 1, rating: "LOVE" },
        { season: 2, episode: 3, rating: "DISLIKE" },
      ],
    });

    render(<ShowDetail data={showData()} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("S1E1: LOVE")).toBeDefined());
    expect(screen.getByText("S2E3: DISLIKE")).toBeDefined();
  });

  it("still renders the sparkline when TMDB has no seasons", async () => {
    apiMock.getShowEpisodeRatings.mockResolvedValue({
      user_ratings: [{ season: 1, episode: 1, rating: "LIKE" }],
    });

    render(
      <ShowDetail
        data={showData({
          tmdb: {
            ...showData().tmdb!,
            seasons: [],
            number_of_seasons: 0,
          },
        })}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(screen.getByText("S1E1: LIKE")).toBeDefined());
  });

  it("does not fetch or render a sparkline when logged out", async () => {
    mockUser = null;
    render(<ShowDetail data={showData()} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Seasons")).toBeDefined());
    expect(apiMock.getShowEpisodeRatings).not.toHaveBeenCalled();
    expect(screen.queryByTestId("rating-sparkline")).toBeNull();
  });
});
