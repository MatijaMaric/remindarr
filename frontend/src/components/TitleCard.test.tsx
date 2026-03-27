import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TitleCard from "./TitleCard";
import { AuthContext } from "../context/AuthContext";
import * as api from "../api";
import type { Title } from "../types";
import type { ReactNode } from "react";

const mockUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthContext value={mockAuthValue as any}>{children}</AuthContext>
    </MemoryRouter>
  );
}

function NoUserWrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AuthContext value={{ ...mockAuthValue, user: null } as any}>{children}</AuthContext>
    </MemoryRouter>
  );
}

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "movie-1",
    object_type: "MOVIE",
    title: "Test Movie",
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-15",
    runtime_minutes: 120,
    short_description: "A test movie",
    genres: ["Action"],
    imdb_id: "tt1234567",
    tmdb_id: "12345",
    poster_url: "https://example.com/poster.jpg",
    age_certification: "PG-13",
    original_language: "en",
    tmdb_url: null,
    imdb_score: 8.5,
    imdb_votes: 10000,
    tmdb_score: 8.0,
    is_tracked: false,
    offers: [],
    ...overrides,
  };
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "trackTitle").mockResolvedValue(undefined as any),
    spyOn(api, "untrackTitle").mockResolvedValue(undefined as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("TitleCard", () => {
  it("renders movie title and year", () => {
    const title = makeTitle({ title: "Inception", release_year: 2010 });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText("Inception")).toBeDefined();
    expect(screen.getByText(/2010/)).toBeDefined();
  });

  it("renders poster image when poster_url is present", () => {
    const title = makeTitle({ poster_url: "https://example.com/poster.jpg" });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    const img = screen.getByAltText("Test Movie");
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/poster.jpg");
  });

  it("renders 'No poster' when poster_url is null", () => {
    const title = makeTitle({ poster_url: null });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText("No poster")).toBeDefined();
  });

  it("shows TV badge for shows", () => {
    const title = makeTitle({ object_type: "SHOW" });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText("TV")).toBeDefined();
  });

  it("does not show TV badge for movies", () => {
    const title = makeTitle({ object_type: "MOVIE" });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.queryByText("TV")).toBeNull();
  });

  it("shows IMDB score badge when present", () => {
    const title = makeTitle({ imdb_score: 9.2 });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText("9.2")).toBeDefined();
  });

  it("does not show IMDB score badge when null", () => {
    const title = makeTitle({ imdb_score: null });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.queryByText(/\d\.\d/)).toBeNull();
  });

  it("shows original title when different from title", () => {
    const title = makeTitle({
      title: "English Title",
      original_title: "Titre Original",
    });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText("Titre Original")).toBeDefined();
  });

  it("does not show original title when same as title", () => {
    const title = makeTitle({
      title: "Same Title",
      original_title: "Same Title",
    });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    const elements = screen.getAllByText("Same Title");
    expect(elements.length).toBe(1);
  });

  it("shows runtime when present", () => {
    const title = makeTitle({ release_year: 2024, runtime_minutes: 142 });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    expect(screen.getByText(/142m/)).toBeDefined();
  });

  it("renders streaming provider button", () => {
    const title = makeTitle({
      offers: [
        {
          id: 1,
          title_id: "movie-1",
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
        },
      ],
    });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    // Full variant renders provider name as text and "Stream" label
    expect(screen.getByText("Netflix")).toBeDefined();
    expect(screen.getByText("Stream")).toBeDefined();
  });

  it("deduplicates providers and shows only first", () => {
    const title = makeTitle({
      offers: [
        {
          id: 1, title_id: "movie-1", provider_id: 8,
          monetization_type: "FLATRATE", presentation_type: "HD",
          price_value: null, price_currency: null,
          url: "https://netflix.com/hd", available_to: null,
          provider_name: "Netflix", provider_technical_name: "netflix",
          provider_icon_url: "https://example.com/netflix.png",
        },
        {
          id: 2, title_id: "movie-1", provider_id: 8,
          monetization_type: "FLATRATE", presentation_type: "4K",
          price_value: null, price_currency: null,
          url: "https://netflix.com/4k", available_to: null,
          provider_name: "Netflix", provider_technical_name: "netflix",
          provider_icon_url: "https://example.com/netflix.png",
        },
      ],
    });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    // Only one provider button should be rendered (deduped + only first shown)
    const links = screen.getAllByRole("link").filter(
      (link) => link.getAttribute("href") === "https://netflix.com/hd"
    );
    expect(links.length).toBe(1);
  });

  it("links to title detail page", () => {
    const title = makeTitle({ id: "movie-42" });
    render(<TitleCard title={title} />, { wrapper: NoUserWrapper });

    const links = screen.getAllByRole("link");
    const detailLinks = links.filter(
      (link) => link.getAttribute("href") === "/title/movie-42"
    );
    expect(detailLinks.length).toBeGreaterThan(0);
  });

  it("renders track button with correct state", () => {
    const title = makeTitle({ id: "movie-99", is_tracked: true });
    render(<TitleCard title={title} />, { wrapper: Wrapper });

    // Real TrackButton renders a button with text "Tracked" when is_tracked=true
    expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
  });
});
