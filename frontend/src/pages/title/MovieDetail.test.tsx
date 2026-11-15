import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import { apiMock, resetApiMock } from "../../test-utils/apiMock";
import { AuthContext } from "../../context/AuthContext";
import type { MovieDetailsResponse, Title } from "../../types";
import "../../i18n";
import MovieDetail from "./MovieDetail";

afterEach(() => {
  cleanup();
  resetApiMock();
});

const title: Title = {
  id: "movie-603",
  object_type: "MOVIE",
  title: "Test Movie",
  original_title: null,
  release_year: 2017,
  release_date: "2017-10-05",
  runtime_minutes: 164,
  short_description: null,
  genres: [],
  imdb_id: null,
  tmdb_id: "603",
  poster_url: null,
  age_certification: null,
  original_language: null,
  tmdb_url: null,
  imdb_score: 8.1,
  imdb_votes: null,
  tmdb_score: 7.6,
  is_tracked: false,
  offers: [
    {
      id: 1,
      title_id: "movie-603",
      provider_id: 384,
      provider_name: "HBO Max",
      provider_technical_name: "hbomax",
      provider_icon_url: "",
      monetization_type: "FLATRATE",
      presentation_type: "",
      price_value: null,
      price_currency: null,
      url: "https://example.test",
      available_to: null,
    },
  ] as unknown as Title["offers"],
};

function renderMovie({
  signedIn,
  pinned,
}: {
  signedIn: boolean;
  pinned?: boolean;
}) {
  const data = {
    title: { ...title, is_pinned: pinned },
    tmdb: {
      id: 603,
      title: "Test Movie",
      overview: "Overview text",
      status: "Released",
      external_ids: { imdb_id: "tt0000001" },
      production_companies: [],
      production_countries: [],
      spoken_languages: [],
      budget: 0,
      revenue: 0,
    },
    country: "US",
  } as unknown as MovieDetailsResponse;
  const auth = {
    user: signedIn ? { id: "u1" } : null,
    subscriptions: null,
  } as ComponentProps<typeof AuthContext>["value"];
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext value={auth}>
        <MemoryRouter>
          <MovieDetail data={data} />
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe("MovieDetail", () => {
  it("does not request watch history when signed out (#1405)", async () => {
    // Signed out, the request 401s, the 401 resets the session and every
    // query refetches — an endless request loop.
    renderMovie({ signedIn: false });
    await waitFor(() => expect(screen.getByText("Overview text")).toBeTruthy());
    expect(apiMock.getWatchHistory).not.toHaveBeenCalled();
  });

  it("requests watch history when signed in", async () => {
    apiMock.getWatchHistory.mockResolvedValue({
      history: [],
      playCount: 0,
      has_more: false,
      next_cursor: null,
    });
    renderMovie({ signedIn: true });
    await waitFor(() =>
      expect(apiMock.getWatchHistory).toHaveBeenCalledWith(
        "movie-603",
        { before: undefined },
        expect.anything(),
      ),
    );
  });

  it("does not repeat hero facts in a metadata strip", () => {
    renderMovie({ signedIn: false });
    expect(screen.queryByText("NETWORK")).toBeNull();
    expect(screen.queryByText("RUNTIME")).toBeNull();
    expect(screen.queryByText("TYPE")).toBeNull();
    // IMDb score appears once (rating badge), not as a chip as well
    expect(screen.getAllByText(/8\.1/)).toHaveLength(1);
    // Year is in the meta line, not repeated in the kicker
    expect(screen.getAllByText(/2017/)).toHaveLength(1);
  });

  it("shows external links inside Details instead of a separate section", () => {
    renderMovie({ signedIn: false });
    expect(screen.queryByRole("heading", { name: "Links" })).toBeNull();
    const details = screen
      .getByRole("heading", { name: "Details" })
      .closest("section")!;
    expect(details.querySelector('a[href*="imdb.com"]')).not.toBeNull();
  });

  it("passes the pinned state to the Pin button", () => {
    renderMovie({ signedIn: true, pinned: true });
    expect(
      screen
        .getByRole("button", { name: "📌 Pinned" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
