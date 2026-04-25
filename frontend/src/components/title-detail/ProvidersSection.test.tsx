import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import type { Offer, WatchProviderCountry } from "../../types";
import ProvidersSection, { groupOffersByType } from "./ProvidersSection";

afterEach(cleanup);

function offer(partial: Partial<Offer>): Offer {
  return {
    id: 1,
    title_id: "movie-1",
    provider_id: 8,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    url: "https://example.com",
    available_to: null,
    provider_name: "Netflix",
    provider_technical_name: "netflix",
    provider_icon_url: "https://example.com/icon.png",
    ...partial,
  };
}

describe("groupOffersByType", () => {
  it("returns no groups when offers is empty", () => {
    expect(groupOffersByType([])).toEqual([]);
  });

  it("buckets offers by monetization type in priority order", () => {
    const offers: Offer[] = [
      offer({ id: 1, provider_id: 1, monetization_type: "RENT", provider_name: "iTunes" }),
      offer({ id: 2, provider_id: 2, monetization_type: "FLATRATE", provider_name: "Netflix" }),
      offer({ id: 3, provider_id: 3, monetization_type: "BUY", provider_name: "Amazon" }),
      offer({ id: 4, provider_id: 4, monetization_type: "FREE", provider_name: "Tubi" }),
    ];

    const groups = groupOffersByType(offers);

    expect(groups.map((g) => g.type)).toEqual(["FLATRATE", "FREE", "RENT", "BUY"]);
    expect(groups[0].offers).toHaveLength(1);
    expect(groups[0].offers[0].provider_name).toBe("Netflix");
  });

  it("dedupes offers per provider within a single type", () => {
    const offers: Offer[] = [
      offer({ id: 1, provider_id: 8, presentation_type: "HD" }),
      offer({ id: 2, provider_id: 8, presentation_type: "4K" }),
      offer({ id: 3, provider_id: 9, provider_name: "Hulu" }),
    ];

    const groups = groupOffersByType(offers);

    expect(groups).toHaveLength(1);
    expect(groups[0].offers).toHaveLength(2);
    expect(groups[0].offers.map((o) => o.provider_id).sort()).toEqual([8, 9]);
  });

  it("ignores unknown monetization types", () => {
    const offers: Offer[] = [offer({ monetization_type: "MYSTERY" })];
    expect(groupOffersByType(offers)).toEqual([]);
  });
});

describe("ProvidersSection", () => {
  it("renders nothing when there are no offers and no TMDB providers", () => {
    const { container } = render(
      <ProvidersSection offers={[]} watchProviders={undefined} watchLink={undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only the Where to Watch section heading once", () => {
    const offers: Offer[] = [offer({ id: 1, provider_id: 8, monetization_type: "FLATRATE", provider_name: "Netflix" })];
    render(<ProvidersSection offers={offers} watchProviders={undefined} watchLink={undefined} />);
    const headings = screen.getAllByRole("heading", { name: /where to watch/i });
    expect(headings).toHaveLength(1);
  });

  it("renders an OfferChip per direct offer with link to provider URL", () => {
    const offers: Offer[] = [
      offer({ id: 1, provider_id: 8, monetization_type: "FLATRATE", provider_name: "Netflix", url: "https://netflix.com/x" }),
      offer({ id: 2, provider_id: 9, monetization_type: "RENT", provider_name: "iTunes", url: "https://itunes.com/x" }),
    ];

    render(<ProvidersSection offers={offers} watchProviders={undefined} watchLink={undefined} />);

    const netflix = screen.getByTitle("Netflix") as HTMLAnchorElement;
    const itunes = screen.getByTitle("iTunes") as HTMLAnchorElement;
    expect(netflix.getAttribute("href")).toBe("https://netflix.com/x");
    expect(itunes.getAttribute("href")).toBe("https://itunes.com/x");
  });

  it("falls back to TMDB providers when there are no direct offers", () => {
    const watchProviders: WatchProviderCountry = {
      link: "https://www.themoviedb.org/movie/123/watch?locale=US",
      flatrate: [{ logo_path: "/logo.jpg", provider_id: 8, provider_name: "Netflix", display_priority: 1 }],
    };

    render(
      <ProvidersSection
        offers={[]}
        watchProviders={watchProviders}
        watchLink={watchProviders.link}
      />,
    );

    // Provider name is rendered
    expect(screen.getByText("Netflix")).toBeTruthy();
    // It should be wrapped in the supplied watchLink
    const link = screen.getByText("Netflix").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(watchProviders.link);
  });

  it("shows the empty placeholder for monetization types with no offers", () => {
    const offers: Offer[] = [offer({ id: 1, provider_id: 8, monetization_type: "FLATRATE" })];
    render(<ProvidersSection offers={offers} watchProviders={undefined} watchLink={undefined} />);
    // RENT, BUY, ADS, FREE should each render the placeholder
    expect(screen.getAllByText("— not available")).toHaveLength(4);
  });
});
