import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import "../i18n";

// --- Mocks ---

let mockUser: any = null;
let mockAuthLoading = false;

mock.module("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, loading: mockAuthLoading }),
  AuthContext: { Provider: ({ children }: any) => children },
}));

function makeSearchTitle(i: number) {
  return {
    id: `t${i}`,
    objectType: i % 2 === 0 ? "MOVIE" : "SHOW",
    title: `Title ${i}`,
    originalTitle: null,
    releaseYear: 2026,
    releaseDate: "2026-01-01",
    runtimeMinutes: 120,
    shortDescription: null,
    genres: [],
    imdbId: null,
    tmdbId: null,
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
    offers: [],
    scores: { imdbScore: null, imdbVotes: null, tmdbScore: 7 },
    isTracked: false,
  };
}

const mockBrowseTitles = mock(() =>
  Promise.resolve({
    titles: Array.from({ length: 20 }, (_, i) => makeSearchTitle(i + 1)),
    count: 20,
    page: 1,
    totalPages: 1,
  })
);

mock.module("../api", () => ({
  browseTitles: mockBrowseTitles,
  getUpcomingEpisodes: mock(() =>
    Promise.resolve({ today: [], upcoming: [], unwatched: [] })
  ),
}));

const { default: HomePage } = await import("./HomePage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockUser = null;
  mockAuthLoading = false;
  mockBrowseTitles.mockClear();
});

describe("HomePage — unauthenticated landing", () => {
  it("renders hero section with CTA buttons", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Track movies & TV shows you love")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Get notified about new episodes, track what you've watched, and discover what's streaming."
      )
    ).toBeDefined();

    const signInLink = screen.getByRole("link", { name: "Sign In" });
    expect(signInLink.getAttribute("href")).toBe("/login");

    const signUpLink = screen.getByRole("link", { name: "Create Account" });
    expect(signUpLink.getAttribute("href")).toBe("/signup");
  });

  it("fetches and displays popular titles", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title 1")).toBeDefined();
    });

    expect(mockBrowseTitles).toHaveBeenCalledWith({ category: "popular", page: 1 });
    expect(screen.getByText("Popular Right Now")).toBeDefined();
  });

  it("limits displayed titles to 12", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Title 12")).toBeDefined();
    });

    // Title 13 should not be rendered (sliced to 12)
    expect(screen.queryByText("Title 13")).toBeNull();
  });

  it("renders hero even when API fails", async () => {
    mockBrowseTitles.mockImplementationOnce(() => Promise.reject(new Error("fail")));

    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Track movies & TV shows you love")).toBeDefined();
    });

    // No titles rendered but hero is still there
    expect(screen.queryByText("Title 1")).toBeNull();
  });

  it("shows Discover More link to /browse", async () => {
    render(<HomePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Discover More/)).toBeDefined();
    });

    const link = screen.getByText(/Discover More/).closest("a");
    expect(link?.getAttribute("href")).toBe("/browse");
  });
});
