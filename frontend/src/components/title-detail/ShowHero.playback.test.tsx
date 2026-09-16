import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { AuthContext } from "../../context/AuthContext";
import type { Offer, Title } from "../../types";
import "../../i18n";
import ShowHero from "./ShowHero";

let mediaSpy: ReturnType<typeof spyOn>;
const matchMedia = window.matchMedia.bind(window);
beforeEach(() => {
  mediaSpy = spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const media = matchMedia(query);
    Object.defineProperty(media, "matches", {
      value: query === "(max-width: 639px)",
    });
    return media;
  });
});
const originalUserAgent = navigator.userAgent;
afterEach(() => {
  cleanup();
  mediaSpy.mockRestore();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent,
  });
});

function offer(
  providerId = 8,
  providerName = "Netflix",
  overrides: Partial<Offer> = {},
): Offer {
  return {
    id: providerId,
    title_id: "show-1",
    provider_id: providerId,
    provider_name: providerName,
    provider_technical_name: providerName.toLowerCase(),
    provider_icon_url: `https://example.test/${providerId}.png`,
    url: `https://example.test/watch/${providerId}`,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    available_to: null,
    ...overrides,
  };
}

function renderHero(offers: Offer[], providerIds: number[] = []) {
  const title: Title = {
    id: "show-1",
    object_type: "SHOW",
    title: "Test Show",
    original_title: null,
    release_year: 2024,
    release_date: null,
    runtime_minutes: null,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: false,
    offers,
  };
  const auth = {
    user: null,
    subscriptions: { providerIds, onlyMine: false },
  } as ComponentProps<typeof AuthContext>["value"];
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext value={auth}>
        <ShowHero title={title} tmdb={null} country="US" />
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe("mobile ShowHero playback", () => {
  it("prefers a subscribed provider and exposes the remaining providers", async () => {
    renderHero([offer(), offer(15, "Hulu"), offer(15, "Hulu")], [15]);
    expect(
      screen.getByRole("link", { name: "Stream Hulu" }).getAttribute("href"),
    ).toBe("https://example.test/watch/15");
    fireEvent.click(
      screen.getByRole("button", { name: "More streaming options (1 more)" }),
    );
    expect(
      (
        await screen.findByRole("link", {
          name: "Watch on Netflix (not subscribed)",
        })
      ).getAttribute("href"),
    ).toBe("https://example.test/watch/8");
  });

  it("keeps the first playable provider when there are no subscriptions", () => {
    renderHero([
      offer(1, "Rent only", { monetization_type: "RENT" }),
      offer(),
      offer(15, "Hulu"),
    ]);
    expect(
      screen.getByRole("link", { name: "Stream Netflix" }).getAttribute("href"),
    ).toBe("https://example.test/watch/8");
  });

  it.each([
    [
      "iPhone",
      "plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F123&server=server-1",
    ],
    ["Android", "https://watch.plex.tv/show/test-show"],
  ])("uses the Plex %s deep link", (userAgent, expectedUrl) => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: userAgent,
    });
    renderHero([
      offer(9999, "Plex", {
        url: "https://app.plex.tv/desktop/#!/server/server-1/details?key=%2Flibrary%2Fmetadata%2F123&watchSlug=test-show&mediaType=show",
      }),
    ]);
    const link = screen.getByRole("link", { name: "Stream Plex" });
    expect(link.getAttribute("href")).toBe(expectedUrl);
    expect(link.getAttribute("target")).toBeNull();
  });

  it.each([
    { offers: [] },
    { offers: [offer(1, "Rental", { monetization_type: "RENT" })] },
  ])("shows no playback action without a playable offer", ({ offers }) => {
    renderHero(offers);
    expect(screen.getByText("▶ No stream")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
