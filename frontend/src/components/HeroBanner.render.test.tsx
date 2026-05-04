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
      </Wrapper>
    );

    const img = container.querySelector(
      'img[src="https://image.tmdb.org/t/p/w780/abc.jpg"]'
    );
    expect(img).not.toBeNull();
    expect(img?.getAttribute("crossorigin")).toBe("anonymous");
  });
});
