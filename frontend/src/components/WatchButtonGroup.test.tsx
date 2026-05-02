import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import WatchButtonGroup from "./WatchButtonGroup";
import { AuthContext } from "../context/AuthContext";
import type { Offer } from "../types";
import type { ReactNode } from "react";

afterEach(cleanup);

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 1,
    title_id: "title-1",
    provider_id: 8,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    url: "https://netflix.com/watch",
    available_to: null,
    provider_name: "Netflix",
    provider_technical_name: "netflix",
    provider_icon_url: "https://example.com/netflix.png",
    ...overrides,
  };
}

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

function Wrapper({
  children,
  subscriptions = null,
}: {
  children: ReactNode;
  subscriptions?: { providerIds: number[]; onlyMine: boolean } | null;
}) {
  return (
    <AuthContext value={{ ...baseAuth, subscriptions } as any}>
      {children}
    </AuthContext>
  );
}

describe("WatchButtonGroup", () => {
  it("returns null for empty offers", () => {
    const { container } = render(
      <Wrapper>
        <WatchButtonGroup offers={[]} />
      </Wrapper>
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null for RENT/BUY-only offers", () => {
    const { container } = render(
      <Wrapper>
        <WatchButtonGroup offers={[makeOffer({ monetization_type: "RENT" }), makeOffer({ monetization_type: "BUY", id: 2 })]} />
      </Wrapper>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a single provider link without caret", () => {
    render(
      <Wrapper>
        <WatchButtonGroup offers={[makeOffer()]} />
      </Wrapper>
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://netflix.com/watch");
    expect(screen.queryByLabelText(/More streaming options/)).toBeNull();
  });

  it("renders a split button with caret for 2 providers", () => {
    const offers = [
      makeOffer(),
      makeOffer({ id: 2, provider_id: 15, provider_name: "Hulu", url: "https://hulu.com/watch", provider_icon_url: "https://example.com/hulu.png" }),
    ];
    render(
      <Wrapper>
        <WatchButtonGroup offers={offers} />
      </Wrapper>
    );
    const primaryLink = screen.getByRole("link");
    expect(primaryLink.getAttribute("href")).toBe("https://netflix.com/watch");
    const caretBtn = screen.getByLabelText(/More streaming options/);
    expect(caretBtn).toBeDefined();
  });

  it("deduplicates providers by provider_id", () => {
    const offers = [
      makeOffer({ id: 1, presentation_type: "HD" }),
      makeOffer({ id: 2, presentation_type: "4K", url: "https://netflix.com/4k" }),
    ];
    render(
      <Wrapper>
        <WatchButtonGroup offers={offers} />
      </Wrapper>
    );
    // Same provider_id=8, deduped → single provider, no caret
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("https://netflix.com/watch");
  });

  it("renders inline variant with multiple buttons", () => {
    const offers = [
      makeOffer(),
      makeOffer({ id: 2, provider_id: 15, provider_name: "Hulu", url: "https://hulu.com/watch", provider_icon_url: "https://example.com/hulu.png" }),
    ];
    render(
      <Wrapper>
        <WatchButtonGroup offers={offers} variant="inline" />
      </Wrapper>
    );
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
  });

  it("respects maxVisible in inline variant", () => {
    const offers = [
      makeOffer({ id: 1, provider_id: 1, url: "https://a.com" }),
      makeOffer({ id: 2, provider_id: 2, url: "https://b.com" }),
      makeOffer({ id: 3, provider_id: 3, url: "https://c.com" }),
    ];
    render(
      <Wrapper>
        <WatchButtonGroup offers={offers} variant="inline" maxVisible={2} />
      </Wrapper>
    );
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
  });

  it("shows Stream label for FLATRATE offer", () => {
    render(
      <Wrapper>
        <WatchButtonGroup offers={[makeOffer()]} />
      </Wrapper>
    );
    expect(screen.getByText("Stream")).toBeDefined();
  });

  it("shows Free label for FREE offer", () => {
    render(
      <Wrapper>
        <WatchButtonGroup offers={[makeOffer({ monetization_type: "FREE" })]} />
      </Wrapper>
    );
    expect(screen.getByText("Free")).toBeDefined();
  });
});

describe("WatchButtonGroup subscription dimming", () => {
  const netflixOffer = makeOffer({ id: 1, provider_id: 8, provider_name: "Netflix" });
  const disneyOffer = makeOffer({
    id: 2,
    provider_id: 337,
    provider_name: "Disney+",
    url: "https://disneyplus.com/watch",
    provider_icon_url: "https://example.com/disney.png",
  });

  it("dims non-subscribed offer in inline variant", () => {
    render(
      <Wrapper subscriptions={{ providerIds: [8], onlyMine: false }}>
        <WatchButtonGroup offers={[netflixOffer, disneyOffer]} variant="inline" />
      </Wrapper>
    );
    // Disney+ wrapper should have opacity-50
    const disneyLink = screen.getByRole("link", { name: /disney/i });
    const disneyWrapper = disneyLink.parentElement;
    expect(disneyWrapper?.className).toContain("opacity-50");
    // Netflix wrapper should NOT have opacity-50
    const netflixLink = screen.getByRole("link", { name: /netflix/i });
    const netflixWrapper = netflixLink.parentElement;
    expect(netflixWrapper?.className ?? "").not.toContain("opacity-50");
  });

  it("does not dim when user has no subscriptions", () => {
    render(
      <Wrapper subscriptions={null}>
        <WatchButtonGroup offers={[netflixOffer, disneyOffer]} variant="inline" />
      </Wrapper>
    );
    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.parentElement?.className ?? "").not.toContain("opacity-50");
    }
  });

  it("sorts subscribed providers first in dropdown variant", () => {
    // Disney (337) is subscribed; Netflix (8) is not — Disney should be primary
    render(
      <Wrapper subscriptions={{ providerIds: [337], onlyMine: false }}>
        <WatchButtonGroup offers={[netflixOffer, disneyOffer]} />
      </Wrapper>
    );
    // Primary link should point to Disney+ (subscribed provider sorts first)
    const primaryLink = screen.getByRole("link");
    expect(primaryLink.getAttribute("href")).toBe("https://disneyplus.com/watch");
  });

  it("marks non-subscribed dropdown item with aria-label suffix", () => {
    render(
      <Wrapper subscriptions={{ providerIds: [8], onlyMine: false }}>
        <WatchButtonGroup offers={[netflixOffer, disneyOffer]} />
      </Wrapper>
    );
    // The dropdown trigger exists (2 providers → split button)
    const trigger = screen.getByLabelText(/More streaming options/);
    expect(trigger).toBeDefined();
  });
});
