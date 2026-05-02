import { describe, it, expect, afterEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EpisodeShowCard } from "./EpisodeShowCard";
import { AuthContext } from "../context/AuthContext";
import type { Episode, Offer } from "../types";
import type { ReactNode } from "react";

const baseAuth = {
  user: null,
  providers: null,
  loading: false,
  subscriptions: null,
  refreshSubscriptions: async () => {},
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  refresh: async () => {},
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext value={baseAuth as any}>
      <MemoryRouter>{children}</MemoryRouter>
    </AuthContext>
  );
}

afterEach(cleanup);

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 1,
    title_id: "show-1",
    provider_id: 100,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    url: "https://example.com/watch",
    available_to: null,
    provider_name: "Netflix",
    provider_technical_name: "netflix",
    provider_icon_url: "https://example.com/icon.png",
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title_id: "show-1",
    season_number: 1,
    episode_number: 1,
    name: "Pilot",
    overview: null,
    air_date: "2020-01-01",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    offers: [makeOffer()],
    ...overrides,
  };
}

describe("EpisodeShowCard", () => {
  it("renders Stream button for released episode with offers", () => {
    const episode = makeEpisode({ air_date: "2020-01-01" });
    const { container } = render(
      <Wrapper>
        <EpisodeShowCard episode={episode} episodeCount={1} />
      </Wrapper>
    );
    const link = container.querySelector('a[href="https://example.com/watch"]');
    expect(link).toBeTruthy();
  });

  it("hides Stream button for unreleased episode", () => {
    const episode = makeEpisode({ air_date: "2099-12-31" });
    const { container } = render(
      <Wrapper>
        <EpisodeShowCard episode={episode} episodeCount={1} />
      </Wrapper>
    );
    const link = container.querySelector('a[href="https://example.com/watch"]');
    expect(link).toBeNull();
  });

  it("hides Stream button when air_date is null", () => {
    const episode = makeEpisode({ air_date: null });
    const { container } = render(
      <Wrapper>
        <EpisodeShowCard episode={episode} episodeCount={1} />
      </Wrapper>
    );
    const link = container.querySelector('a[href="https://example.com/watch"]');
    expect(link).toBeNull();
  });

  it("renders Stream button for episode airing today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const episode = makeEpisode({ air_date: today });
    const { container } = render(
      <Wrapper>
        <EpisodeShowCard episode={episode} episodeCount={1} />
      </Wrapper>
    );
    const link = container.querySelector('a[href="https://example.com/watch"]');
    expect(link).toBeTruthy();
  });
});
