import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import { resetApiMock } from "../../test-utils/apiMock";
import { AuthContext } from "../../context/AuthContext";
import type { ShowDetailsResponse, Title } from "../../types";
import "../../i18n";
import ShowDetail from "./ShowDetail";

afterEach(() => {
  cleanup();
  resetApiMock();
});

const title: Title = {
  id: "tv-82452",
  object_type: "SHOW",
  title: "Test Show",
  original_title: null,
  release_year: 2024,
  release_date: null,
  runtime_minutes: null,
  short_description: null,
  genres: [],
  imdb_id: null,
  tmdb_id: "82452",
  poster_url: null,
  age_certification: null,
  original_language: null,
  tmdb_url: null,
  imdb_score: 7.4,
  imdb_votes: null,
  tmdb_score: null,
  is_tracked: false,
  offers: [
    {
      id: 1,
      title_id: "tv-82452",
      provider_id: 8,
      provider_name: "Netflix",
      provider_icon_url: "",
      monetization_type: "FLATRATE",
      url: "https://example.test",
    },
  ] as unknown as Title["offers"],
};

function renderShow() {
  const data = {
    title,
    tmdb: {
      id: 82452,
      name: "Test Show",
      overview: "Overview text",
      status: "Returning Series",
      number_of_seasons: 2,
      number_of_episodes: 15,
      first_air_date: "2024-02-22",
      created_by: [{ id: 9, name: "Creator Person", profile_path: null }],
      credits: { cast: [], crew: [] },
      seasons: [
        {
          season_number: 1,
          name: "Season 1",
          episode_count: 8,
          air_date: "2024-02-22",
          poster_path: null,
        },
      ],
      external_ids: { imdb_id: "tt0000002" },
      production_companies: [],
      production_countries: [],
      spoken_languages: [],
    },
    country: "US",
  } as unknown as ShowDetailsResponse;
  const auth = {
    user: null,
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
          <ShowDetail data={data} />
        </MemoryRouter>
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe("ShowDetail", () => {
  it("phone metadata strip leaves out facts the hero already shows", () => {
    renderShow();
    expect(screen.getByText("STATUS")).toBeTruthy();
    expect(screen.getByText("SEASONS")).toBeTruthy();
    // "NETWORK" showed the first streaming offer, not the network.
    expect(screen.queryByText("NETWORK")).toBeNull();
    expect(screen.queryByText("TYPE")).toBeNull();
    expect(screen.queryByText("IMDB")).toBeNull();
  });

  it("puts Seasons directly after the overview", () => {
    renderShow();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings.indexOf("Seasons")).toBe(headings.indexOf("Overview") + 1);
    expect(headings.indexOf("Seasons")).toBeLessThan(
      headings.indexOf("Created By"),
    );
  });

  it("shows external links inside Details instead of a separate section", () => {
    renderShow();
    expect(screen.queryByRole("heading", { name: "Links" })).toBeNull();
    const details = screen
      .getByRole("heading", { name: "Details" })
      .closest("section")!;
    expect(details.querySelector('a[href*="imdb.com"]')).not.toBeNull();
  });
});
