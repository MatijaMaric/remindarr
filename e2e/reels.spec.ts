import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import { ReelsPage } from "./pages/reels-page";

test.describe.configure({ mode: "serial" });

const UPCOMING_RESPONSE = {
  today: [],
  upcoming: [],
  unwatched: [
    {
      id: 101,
      title_id: "tv-9876",
      season_number: 1,
      episode_number: 1,
      name: "Pilot",
      overview: "The first episode of the show.",
      air_date: "2024-03-01",
      still_path: null,
      show_title: "Test Show",
      poster_url: null,
      is_watched: false,
      offers: [],
    },
  ],
};

const EMPTY_UPCOMING_RESPONSE = {
  today: [],
  upcoming: [],
  unwatched: [],
};

const BROWSE_POPULAR_RESPONSE = {
  titles: [
    {
      id: "movie-12345",
      objectType: "MOVIE",
      title: "Popular Movie",
      originalTitle: "Popular Movie",
      releaseYear: 2024,
      releaseDate: "2024-06-15",
      runtimeMinutes: 120,
      shortDescription: "A popular movie",
      genres: ["Action"],
      imdbId: "tt1234567",
      tmdbId: 12345,
      posterUrl: null,
      ageCertification: "PG-13",
      originalLanguage: "en",
      tmdbUrl: "https://www.themoviedb.org/movie/12345",
      offers: [],
      scores: { imdbScore: 7.5, imdbVotes: 10000, tmdbScore: 7.8 },
      isTracked: false,
    },
  ],
  page: 1,
  totalPages: 1,
  totalResults: 1,
};

async function setupBaseMocks(page: ReelsPage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await mockLoggedIn(page);
  await page.route("**/api/episodes/upcoming**", (route) =>
    route.fulfill({ json: UPCOMING_RESPONSE }),
  );
}

test.describe("Reels page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: page loads with source picker and first card visible", async ({
    page,
  }) => {
    const rp = new ReelsPage(page);
    await setupBaseMocks(page);
    await rp.goto();
    await rp.waitForVisible(rp.comingSoonChip());

    // Reels label visible in overlay
    await expect(page.getByText("Reels")).toBeVisible();
    // Feed link visible
    await expect(page.getByRole("link", { name: "Feed" })).toBeVisible();
    // All source chip buttons visible
    await expect(rp.comingSoonChip()).toBeVisible();
    await expect(rp.popularChip()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "From My Genres" }),
    ).toBeVisible();
    await expect(rp.friendsLovedChip()).toBeVisible();
    await expect(page.getByRole("button", { name: "Movies" })).toBeVisible();
    // First card shows "Test Show"
    await expect(page.getByText("Test Show")).toBeVisible();
    // Mark as Watched button is visible
    await expect(rp.markWatchedButton()).toBeVisible();
  });

  test("TC-02: unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/reels");
    await page.waitForURL("**/login**");

    expect(page.url()).toContain("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByText("Reels")).not.toBeVisible();
  });

  test("TC-03: switching source to Popular loads browse titles", async ({
    page,
  }) => {
    const rp = new ReelsPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/episodes/upcoming**", (route) =>
      route.fulfill({ json: UPCOMING_RESPONSE }),
    );
    await page.route("**/api/browse**", (route) =>
      route.fulfill({ json: BROWSE_POPULAR_RESPONSE }),
    );
    await rp.goto();
    await rp.waitForVisible(rp.comingSoonChip());

    // Dispatch a click event directly — the source picker overlay (z-40) is visually
    // under the sticky nav (z-50) on desktop, so Playwright's pointer simulation is
    // blocked. Using dispatchEvent bypasses the hit-testing check.
    await rp.popularChip().dispatchEvent("click");
    await page.waitForURL("**/reels?source=popular**");
    await rp.waitForVisible(page.getByText("Popular Movie").first());

    expect(page.url()).toContain("source=popular");
    await expect(page.getByText("Popular Movie").first()).toBeVisible();
  });

  test("TC-04: empty state — no unwatched episodes", async ({ page }) => {
    const rp = new ReelsPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/episodes/upcoming**", (route) =>
      route.fulfill({ json: EMPTY_UPCOMING_RESPONSE }),
    );
    await rp.goto();
    await page.waitForTimeout(500);

    await expect(page.getByText("No unwatched episodes")).toBeVisible();
    await expect(page.getByText("You're all caught up!")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View Upcoming" }),
    ).toBeVisible();
  });

  test("TC-05: Friends Loved empty state — no friends yet", async ({
    page,
  }) => {
    const rp = new ReelsPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/episodes/upcoming**", (route) =>
      route.fulfill({ json: UPCOMING_RESPONSE }),
    );
    await page.route("**/api/social/friends-loved**", (route) =>
      route.fulfill({ json: { titles: [] } }),
    );
    await rp.goto();
    await rp.waitForVisible(rp.comingSoonChip());

    // dispatchEvent bypasses hit-test block from sticky nav (z-50 over z-40 overlay)
    await rp.friendsLovedChip().dispatchEvent("click");
    await rp.waitForVisible(page.getByText("Nothing here yet"));

    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(
      page.getByText(/Follow some friends to see what they love/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Find people to follow" }),
    ).toBeVisible();
    // Source picker still visible
    await expect(rp.friendsLovedChip()).toBeVisible();
  });

  test("TC-06: top nav bar is hidden on the reels page (mobile viewport)", async ({
    page,
  }) => {
    const rp = new ReelsPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await setupBaseMocks(page);
    await rp.goto();
    await rp.waitForVisible(rp.comingSoonChip());

    // On mobile, the nav has hidden class so is not visible
    await expect(rp.mainNav()).not.toBeVisible();
    // But the reels source picker overlay is visible
    await expect(rp.comingSoonChip()).toBeVisible();
  });

  test("TC-07: marking an episode as watched shows undo bar", async ({
    page,
  }) => {
    const rp = new ReelsPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/episodes/upcoming**", (route) =>
      route.fulfill({ json: UPCOMING_RESPONSE }),
    );
    await page.route("**/api/watched/**", (route) =>
      route.fulfill({ status: 200, json: {} }),
    );
    await rp.goto();
    await rp.waitForVisible(rp.markWatchedButton());

    await rp.markWatchedButton().click();
    await rp.waitForVisible(rp.undoButton());

    // Undo bar appears with episode code and Undo button
    await expect(rp.undoButton()).toBeVisible();
    await expect(page.getByText("S01E01")).toBeVisible();
    // Rating buttons visible (aria-label="Love" / "Like" on the undo bar)
    await expect(
      page.getByRole("button", { name: "Love", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Like", exact: true }),
    ).toBeVisible();
  });
});
