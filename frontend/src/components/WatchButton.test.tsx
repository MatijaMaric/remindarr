import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import WatchButton from "./WatchButton";

describe("WatchButton", () => {
  const defaultProps = {
    url: "https://example.com/watch",
    providerId: 8,
    providerName: "Netflix",
    providerIconUrl: "https://example.com/netflix.png",
  };

  it("renders compact variant with link", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="compact" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("https://example.com/watch");
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("title")).toBe("Netflix");
  });

  it("renders full variant with provider name", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="full" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain("Netflix");
    expect(link!.getAttribute("href")).toBe("https://example.com/watch");
  });

  it("renders compact variant by default", () => {
    const { container } = render(<WatchButton {...defaultProps} />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("title")).toBe("Netflix");
    const img = link!.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("alt")).toBe("Netflix");
  });

  it("renders provider icon in full variant", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="full" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("https://example.com/netflix.png");
  });

  it("renders monetization label in full variant when provided", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="FLATRATE" />
    );
    const link = container.querySelector("a");
    expect(link!.textContent).toContain("Stream");
    expect(link!.textContent).toContain("Netflix");
  });

  it("renders Rent label for RENT monetization type", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="RENT" />
    );
    expect(container.querySelector("a")!.textContent).toContain("Rent");
  });

  it("renders Buy label for BUY monetization type", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="full" monetizationType="BUY" />
    );
    expect(container.querySelector("a")!.textContent).toContain("Buy");
  });

  it("omits monetization label in full variant when not provided", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="full" />);
    const text = container.querySelector("a")!.textContent!;
    expect(text).not.toContain("Stream");
    expect(text).not.toContain("Rent");
    expect(text).not.toContain("Buy");
  });

  it("does not render monetization label in compact variant", () => {
    const { container } = render(
      <WatchButton {...defaultProps} variant="compact" monetizationType="FLATRATE" />
    );
    expect(container.textContent).not.toContain("Stream");
  });
});
