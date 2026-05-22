import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { AuthContext } from "../context/AuthContext";

// Prevent canvas extraction from throwing in happy-dom
mock.module("fast-average-color", () => ({
  FastAverageColor: class {
    getColor() {
      return { hex: "#1a2b3c", isDark: true };
    }
  },
}));

import HeroBanner from "./HeroBanner";
import type { Episode } from "../types";

const mockAuthValue = {
  user: null,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext value={mockAuthValue as any}>
      <MemoryRouter>{children}</MemoryRouter>
    </AuthContext>
  );
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    title_id: "tv-1",
    season_number: 1,
    episode_number: 1,
    name: "Pilot",
    overview: null,
    air_date: "2025-01-01",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    backdrop_url: "https://image.tmdb.org/t/p/w780/abc.jpg",
    is_watched: false,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("HeroBanner", () => {
  it("renders backdrop img with crossOrigin anonymous to prevent CORS cache-mode mismatch (#695)", () => {
    const { container } = render(
      <Wrapper>
        <HeroBanner episodes={[makeEpisode()]} />
      </Wrapper>,
    );

    const img = container.querySelector(
      'img[src="https://image.tmdb.org/t/p/w780/abc.jpg"]',
    );
    expect(img).not.toBeNull();
    expect(img?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("renders pagination dots with aria-label and aria-current when multiple slides exist (#682)", () => {
    const episodes = [
      makeEpisode({ id: 1, title_id: "tv-1", show_title: "Show A" }),
      makeEpisode({ id: 2, title_id: "tv-2", show_title: "Show B" }),
      makeEpisode({ id: 3, title_id: "tv-3", show_title: "Show C" }),
    ];

    const { container } = render(
      <Wrapper>
        <HeroBanner episodes={episodes} />
      </Wrapper>,
    );

    const dots = container.querySelectorAll('button[aria-label^="Slide"]');
    expect(dots.length).toBe(3);
    expect(dots[0].getAttribute("aria-label")).toBe("Slide 1 of 3");
    expect(dots[1].getAttribute("aria-label")).toBe("Slide 2 of 3");
    expect(dots[2].getAttribute("aria-label")).toBe("Slide 3 of 3");

    // First dot is active by default
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    expect(dots[1].getAttribute("aria-current")).toBeNull();
    expect(dots[2].getAttribute("aria-current")).toBeNull();
  });

  it("does not render pagination dots when only one slide exists", () => {
    const { container } = render(
      <Wrapper>
        <HeroBanner episodes={[makeEpisode()]} />
      </Wrapper>,
    );

    const dots = container.querySelectorAll('button[aria-label^="Slide"]');
    expect(dots.length).toBe(0);
  });
});
