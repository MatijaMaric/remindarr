import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import WatchButtonGroup from "./WatchButtonGroup";
import type { Offer } from "../types";

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

describe("WatchButtonGroup", () => {
  it("returns null for empty offers", () => {
    const { container } = render(<WatchButtonGroup offers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for RENT/BUY-only offers", () => {
    const { container } = render(
      <WatchButtonGroup offers={[makeOffer({ monetization_type: "RENT" }), makeOffer({ monetization_type: "BUY", id: 2 })]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a single provider link without caret", () => {
    render(<WatchButtonGroup offers={[makeOffer()]} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://netflix.com/watch");
    expect(screen.queryByLabelText(/More streaming options/)).toBeNull();
  });

  it("renders a split button with caret for 2 providers", () => {
    const offers = [
      makeOffer(),
      makeOffer({ id: 2, provider_id: 15, provider_name: "Hulu", url: "https://hulu.com/watch", provider_icon_url: "https://example.com/hulu.png" }),
    ];
    render(<WatchButtonGroup offers={offers} />);
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
    render(<WatchButtonGroup offers={offers} />);
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
    render(<WatchButtonGroup offers={offers} variant="inline" />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
  });

  it("respects maxVisible in inline variant", () => {
    const offers = [
      makeOffer({ id: 1, provider_id: 1, url: "https://a.com" }),
      makeOffer({ id: 2, provider_id: 2, url: "https://b.com" }),
      makeOffer({ id: 3, provider_id: 3, url: "https://c.com" }),
    ];
    render(<WatchButtonGroup offers={offers} variant="inline" maxVisible={2} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2);
  });

  it("shows Stream label for FLATRATE offer", () => {
    render(<WatchButtonGroup offers={[makeOffer()]} />);
    expect(screen.getByText("Stream")).toBeDefined();
  });

  it("shows Free label for FREE offer", () => {
    render(<WatchButtonGroup offers={[makeOffer({ monetization_type: "FREE" })]} />);
    expect(screen.getByText("Free")).toBeDefined();
  });
});
