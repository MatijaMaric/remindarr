import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { apiMock, resetApiMock } from "../../test-utils/apiMock";
import { AuthContext } from "../../context/AuthContext";
import type { ShowDetailsResponse, Title, TmdbVideo } from "../../types";
import "../../i18n";
import ShowHero from "./ShowHero";

let mobile = true;
let mediaSpy: ReturnType<typeof spyOn>;
const matchMedia = window.matchMedia.bind(window);
beforeEach(() => {
  mediaSpy = spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const media = matchMedia(query);
    Object.defineProperty(media, "matches", {
      value: mobile && query === "(max-width: 639px)",
    });
    return media;
  });
});
afterEach(() => {
  cleanup();
  mediaSpy.mockRestore();
  resetApiMock();
});

const trailer: TmdbVideo = {
  key: "test-trailer",
  site: "YouTube",
  type: "Trailer",
  official: true,
  size: 1080,
  published_at: "2024-01-01",
};
function renderHero({
  signedIn = true,
  tracked = true,
  videos = [trailer],
  pinned,
  imdbScore = null,
}: {
  signedIn?: boolean;
  tracked?: boolean;
  videos?: TmdbVideo[];
  pinned?: boolean;
  imdbScore?: number | null;
} = {}) {
  const title: Title = {
    id: "show-1",
    object_type: "SHOW",
    title: "Test Show",
    original_title: null,
    release_year: 2024,
    release_date: null,
    runtime_minutes: null,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: imdbScore,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: tracked,
    is_public: true,
    is_pinned: pinned,
    offers: [],
  };
  const tmdb = { videos: { results: videos } } as ShowDetailsResponse["tmdb"];
  const auth = {
    user: signedIn ? { id: "u1" } : null,
    subscriptions: null,
  } as ComponentProps<typeof AuthContext>["value"];
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AuthContext value={auth}>
        <ShowHero title={title} tmdb={tmdb} country="US" />
      </AuthContext>
    </QueryClientProvider>,
  );
}

describe.each([true, false])("ShowHero actions (mobile: %s)", (isMobile) => {
  beforeEach(() => {
    mobile = isMobile;
  });
  it("shows the pinned state from the title (#1405)", () => {
    renderHero({ pinned: true });
    expect(
      screen
        .getByRole("button", { name: "📌 Pinned" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the IMDb score once", () => {
    renderHero({ imdbScore: 8.4 });
    expect(screen.getAllByText(/8\.4/)).toHaveLength(1);
  });

  it("opens and hides the available trailer without desktop mode", () => {
    renderHero();
    const button = screen.getByRole("button", { name: "Watch Trailer" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByAltText("Trailer thumbnail")).toBeNull();
    fireEvent.click(button);
    expect(
      screen.getByAltText("Trailer thumbnail").getAttribute("src"),
    ).toContain("/test-trailer/");
    expect(
      screen
        .getByRole("button", { name: "Hide Trailer" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide Trailer" }));
    expect(screen.queryByAltText("Trailer thumbnail")).toBeNull();
  });

  it("updates the tracked title's privacy in both directions", async () => {
    apiMock.updateTitleVisibility.mockResolvedValue(undefined);
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    await waitFor(() =>
      expect(apiMock.updateTitleVisibility).toHaveBeenCalledWith(
        "show-1",
        false,
      ),
    );
    const hidden = screen.getByRole("button", { name: "Hidden" });
    await waitFor(() => expect(hidden.hasAttribute("disabled")).toBe(false));
    fireEvent.click(hidden);
    await waitFor(() =>
      expect(apiMock.updateTitleVisibility).toHaveBeenCalledWith(
        "show-1",
        true,
      ),
    );
    expect(screen.getByRole("button", { name: "Public" })).toBeDefined();
  });

  it.each([{ signedIn: false }, { tracked: false }])(
    "keeps privacy conditional on signed-in tracking",
    (options) => {
      renderHero(options);
      expect(screen.queryByRole("button", { name: "Public" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Hidden" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Watch Trailer" }),
      ).toBeDefined();
    },
  );

  it.each([
    { videos: [] },
    { videos: [{ ...trailer, site: "Vimeo" }] },
    { videos: [{ ...trailer, type: "Teaser" }] },
  ])("omits unavailable trailers", (options) => {
    renderHero(options);
    expect(screen.queryByRole("button", { name: "Watch Trailer" })).toBeNull();
    expect(screen.queryByAltText("Trailer thumbnail")).toBeNull();
  });
});

describe("ShowHero desktop kicker", () => {
  beforeEach(() => {
    mobile = false;
  });
  it("leaves the year to the meta line", () => {
    renderHero();
    expect(screen.getByText("TV Show")).toBeTruthy();
    expect(screen.queryByText(/TV Show · 2024/)).toBeNull();
  });
});
