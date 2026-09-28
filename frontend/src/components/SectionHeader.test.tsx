import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SectionHeader } from "./SectionHeader";

afterEach(cleanup);

function renderHeader(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("SectionHeader", () => {
  it("renders the kicker, title, and trailing link", () => {
    renderHeader(
      <SectionHeader
        kicker="Browse"
        title="Popular"
        href="/browse"
        linkLabel="Discover More →"
      />,
    );

    expect(screen.getByText("Browse")).toBeDefined();
    const heading = screen.getByRole("heading", { name: "Popular" });
    expect(heading.className).toContain("text-xl");
    expect(heading.className).toContain("font-bold");
    const link = screen.getByRole("link", { name: "Discover More →" });
    expect(link.getAttribute("href")).toBe("/browse");
    expect(link.className).toContain("font-mono");
    expect(link.className).toContain("text-amber-400");
  });

  it("omits the trailing link when none is provided", () => {
    renderHeader(<SectionHeader kicker="Coming up" title="Airing soon" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading", { name: "Airing soon" })).toBeDefined();
  });

  it("places optional heading content beside the title", () => {
    renderHeader(
      <SectionHeader
        kicker="Up next"
        title="Unwatched"
        href="/upcoming"
        linkLabel="See all →"
        headingExtra={<span>Reels</span>}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Unwatched" });
    expect(heading.parentElement?.className).toContain("items-center");
    expect(heading.parentElement?.className).toContain("gap-3");
    expect(screen.getByText("Reels")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "See all →" }).getAttribute("href"),
    ).toBe("/upcoming");
  });
});
