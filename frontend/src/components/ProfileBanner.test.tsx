import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ProfileBanner from "./ProfileBanner";
import type { ProfileBackdrop } from "../types";

afterEach(cleanup);

function renderBanner(backdrops: ProfileBackdrop[]) {
  return render(
    <MemoryRouter>
      <ProfileBanner backdrops={backdrops} />
    </MemoryRouter>,
  );
}

describe("ProfileBanner", () => {
  it("renders nothing when backdrops array is empty", () => {
    const { container } = renderBanner([]);
    expect(container.innerHTML).toBe("");
  });

  it("renders a single backdrop image", () => {
    const backdrops = [{ id: "show-1", title: "Test Show", backdrop_url: "https://example.com/backdrop.jpg" }];
    renderBanner(backdrops);

    const img = screen.getByAltText("Test Show");
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/backdrop.jpg");
  });

  it("renders multiple backdrop images", () => {
    const backdrops = [
      { id: "show-1", title: "Show One", backdrop_url: "https://example.com/1.jpg" },
      { id: "show-2", title: "Show Two", backdrop_url: "https://example.com/2.jpg" },
      { id: "show-3", title: "Show Three", backdrop_url: "https://example.com/3.jpg" },
    ];
    renderBanner(backdrops);

    expect(screen.getByAltText("Show One")).toBeDefined();
    expect(screen.getByAltText("Show Two")).toBeDefined();
    expect(screen.getByAltText("Show Three")).toBeDefined();
  });

  it("links backdrop images to title detail pages", () => {
    const backdrops = [{ id: "show-42", title: "Test Show", backdrop_url: "https://example.com/backdrop.jpg" }];
    renderBanner(backdrops);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/title/show-42");
  });
});
