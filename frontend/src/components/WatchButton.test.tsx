import { describe, it, expect, afterEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import i18n from "../i18n";
import WatchButton, { watchActionLabel } from "./WatchButton";

afterEach(cleanup);

describe("WatchButton", () => {
  const defaultProps = {
    url: "https://example.com/watch",
    providerId: 8,
    providerName: "Netflix",
    providerIconUrl: "https://example.com/netflix.png",
  };

  it("renders compact variant with link", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="compact" />,
    );
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("https://example.com/watch");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("title")).toBe(
      "Open on Netflix — opens external site",
    );
  });

  it("renders full variant with provider icon only (no name text)", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" />,
    );
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.textContent).not.toContain("Netflix");
    expect(link!.getAttribute("href")).toBe("https://example.com/watch");
    const img = link!.querySelector("img");
    expect(img!.getAttribute("alt")).toBe("Netflix");
  });

  it("renders compact variant by default", () => {
    const { container } = render(<WatchButton {...defaultProps} />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("title")).toBe(
      "Open on Netflix — opens external site",
    );
    const img = link!.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("alt")).toBe("Netflix");
  });

  it("renders provider icon in full variant", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" />,
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("https://example.com/netflix.png");
  });

  it("renders monetization label in full variant when provided", () => {
    const { container } = render(
      <WatchButton
        {...defaultProps}
        variant="full"
        monetizationType="FLATRATE"
      />,
    );
    const link = container.querySelector("a");
    expect(link!.textContent).toContain("Stream");
    expect(link!.textContent).not.toContain("Netflix");
  });

  it("renders Rent label for RENT monetization type", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="RENT" />,
    );
    expect(container.querySelector("a")!.textContent).toContain("Rent");
  });

  it("renders Buy label for BUY monetization type", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="BUY" />,
    );
    expect(container.querySelector("a")!.textContent).toContain("Buy");
  });

  it("omits monetization label in full variant when not provided", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" />,
    );
    const text = container.querySelector("a")!.textContent!;
    expect(text).not.toContain("Stream");
    expect(text).not.toContain("Rent");
    expect(text).not.toContain("Buy");
  });

  it("does not render monetization label in compact variant", () => {
    const { container } = render(
      <WatchButton
        {...defaultProps}
        variant="compact"
        monetizationType="FLATRATE"
      />,
    );
    expect(container.textContent).not.toContain("Stream");
  });

  it("full variant has centered content by default", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" />,
    );
    const link = container.querySelector("a");
    expect(link!.className).toContain("justify-center");
  });

  it("applies custom className to full variant", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" className="custom-class" />,
    );
    const link = container.querySelector("a");
    expect(link!.className).toContain("custom-class");
  });

  it("uses text-xs by default in full variant", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" />,
    );
    const link = container.querySelector("a");
    expect(link!.className).toContain("text-xs");
  });

  it("omits text-xs when className includes a font-size class", () => {
    const { container } = render(
      <WatchButton
        {...defaultProps}
        variant="full"
        className="text-base font-semibold"
      />,
    );
    const link = container.querySelector("a");
    expect(link!.className).not.toContain("text-xs");
    expect(link!.className).toContain("text-base");
  });

  it("names the provider and offer type in the accessible label", () => {
    const { getByRole } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="RENT" />,
    );
    const link = getByRole("link", {
      name: "Rent on Netflix — opens external site",
    });
    expect(link.getAttribute("title")).toBe(
      "Rent on Netflix — opens external site",
    );
  });

  it("marks unsubscribed providers in the accessible label", () => {
    const { getByRole } = render(
      <WatchButton
        {...defaultProps}
        variant="full"
        monetizationType="FLATRATE"
        subscribed={false}
      />,
    );
    expect(
      getByRole("link", {
        name: "Stream on Netflix (not subscribed) — opens external site",
      }),
    ).toBeDefined();
  });
});

describe("watchActionLabel", () => {
  const t = i18n.t.bind(i18n);

  it.each([
    ["FLATRATE", "Stream on Netflix — opens external site"],
    ["FREE", "Watch free on Netflix — opens external site"],
    ["ADS", "Watch with ads on Netflix — opens external site"],
    ["RENT", "Rent on Netflix — opens external site"],
    ["BUY", "Buy on Netflix — opens external site"],
    [undefined, "Open on Netflix — opens external site"],
    ["UNKNOWN", "Open on Netflix — opens external site"],
  ])("labels %s offers", (type, expected) => {
    expect(watchActionLabel(t, "Netflix", type)).toBe(expected);
  });

  it("only flags not-subscribed when explicitly false", () => {
    expect(watchActionLabel(t, "Hulu", "FLATRATE", { subscribed: true })).toBe(
      "Stream on Hulu — opens external site",
    );
    expect(watchActionLabel(t, "Hulu", "FLATRATE", { subscribed: false })).toBe(
      "Stream on Hulu (not subscribed) — opens external site",
    );
  });
});
