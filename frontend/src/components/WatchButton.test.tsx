import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import WatchButton from "./WatchButton";

describe("WatchButton", () => {
  const defaultProps = {
    url: "https://example.com/watch",
    providerId: 8,
    providerName: "Netflix",
    providerIconUrl: "https://example.com/netflix.png",
  };

  it("renders compact variant with link", () => {
    render(<WatchButton {...defaultProps} variant="compact" />);
    const link = screen.getByTitle("Netflix");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://example.com/watch");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders full variant with provider name", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="full" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain("Netflix");
    expect(link!.getAttribute("href")).toBe("https://example.com/watch");
  });

  it("renders compact variant by default", () => {
    render(<WatchButton {...defaultProps} />);
    const link = screen.getByTitle("Netflix");
    expect(link).toBeTruthy();
    // Compact variant should have an img
    const img = link.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("alt")).toBe("Netflix");
  });

  it("renders provider icon in full variant", () => {
    const { container } = render(<WatchButton {...defaultProps} variant="full" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("https://example.com/netflix.png");
  });
});
