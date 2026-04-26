import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import "../i18n";

const mockGetKioskData = mock(() =>
  Promise.resolve({
    tonight: [],
    week: [],
    recent: [],
    watching: [],
  })
);

mock.module("../api", () => ({
  getKioskData: mockGetKioskData,
}));

const { default: KioskPage } = await import("./KioskPage");

function Wrapper({ token = "abc123" }: { token?: string }) {
  return (
    <MemoryRouter initialEntries={[`/kiosk/${token}`]}>
      <Routes>
        <Route path="/kiosk/:token" element={<KioskPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockGetKioskData.mockReset();
  mockGetKioskData.mockImplementation(() =>
    Promise.resolve({ tonight: [], week: [], recent: [], watching: [] })
  );
});

function makeEpisode(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title_id: "show-1",
    season_number: 1,
    episode_number: id,
    name: `Episode ${id}`,
    overview: null,
    air_date: "2099-01-01",
    still_path: null,
    show_title: "Test Show",
    poster_url: null,
    is_watched: false,
    offers: [],
    ...overrides,
  };
}

describe("KioskPage", () => {
  it("renders section headings", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Tonight")).toBeTruthy();
      expect(screen.getByText("This Week")).toBeTruthy();
      expect(screen.getByText("Latest Releases")).toBeTruthy();
      expect(screen.getByText("Currently Watching")).toBeTruthy();
    });
  });

  it("renders the Remindarr branding header", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Remindarr")).toBeTruthy();
    });
  });

  it("shows empty state for tonight when no episodes", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Nothing airing tonight.")).toBeTruthy();
    });
  });

  it("shows empty state for currently watching when none", async () => {
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Nothing in progress.")).toBeTruthy();
    });
  });

  it("renders tonight episodes when present", async () => {
    mockGetKioskData.mockImplementation(() =>
      Promise.resolve({
        tonight: [makeEpisode(1)],
        week: [],
        recent: [],
        watching: [],
      })
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText("Test Show")).toBeTruthy();
    });
  });

  it("renders recent titles when present", async () => {
    mockGetKioskData.mockImplementation(() =>
      Promise.resolve({
        tonight: [],
        week: [],
        recent: [{ id: "m1", title: "New Movie", release_year: 2024, poster_url: null, object_type: "MOVIE", original_title: null, release_date: "2024-01-01", runtime_minutes: null, short_description: null, imdb_id: null, tmdb_id: null, tmdb_url: null, imdb_score: null, imdb_votes: null, tmdb_score: null, is_tracked: false, is_watched: false, genres: [], offers: [], age_certification: null, original_language: null, updated_at: null }],
        watching: [],
      })
    );
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getAllByText("New Movie").length).toBeGreaterThan(0);
    });
  });

  it("shows error state for invalid token (rejected promise)", async () => {
    mockGetKioskData.mockImplementation(() =>
      Promise.reject(new Error("Invalid kiosk token"))
    );
    render(<Wrapper token="bad-token" />);
    await waitFor(() => {
      expect(screen.getByText("Kiosk unavailable")).toBeTruthy();
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
  });

  it("calls getKioskData with the token from the URL", async () => {
    render(<Wrapper token="mytoken123" />);
    await waitFor(() => {
      expect(mockGetKioskData).toHaveBeenCalledWith("mytoken123");
    });
  });
});
