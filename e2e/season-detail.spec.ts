import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { SeasonDetailPage } from "./pages/season-detail-page";

test.describe.configure({ mode: "serial" });

const SEASON_DETAILS = {
  title: {
    id: "tv-tt9876543",
    object_type: "SHOW",
    title: "Test Show",
    original_title: "Test Show",
    release_year: 2023,
    release_date: "2023-03-01",
    runtime_minutes: 45,
    short_description: "A test show description",
    genres: ["Drama"],
    imdb_id: "tt9876543",
    tmdb_id: "98765",
    poster_url: null,
    age_certification: "TV-MA",
    original_language: "en",
    tmdb_url: "https://www.themoviedb.org/tv/98765",
    imdb_score: 8.2,
    imdb_votes: 50000,
    tmdb_score: 8.5,
    is_tracked: false,
    offers: [],
  },
  tmdb: {
    id: 101,
    name: "Season 1",
    overview: "The first season of Test Show.",
    air_date: "2023-03-01",
    poster_path: null,
    season_number: 1,
    vote_average: 8.1,
    episodes: [
      {
        id: 1001,
        name: "Pilot",
        overview: "The first episode.",
        air_date: "2023-03-01",
        episode_number: 1,
        season_number: 1,
        still_path: null,
        runtime: 48,
        vote_average: 8.5,
        guest_stars: [],
        crew: [],
      },
      {
        id: 1002,
        name: "Second Episode",
        overview: "The second episode.",
        air_date: "2023-03-08",
        episode_number: 2,
        season_number: 1,
        still_path: null,
        runtime: 44,
        vote_average: 7.9,
        guest_stars: [],
        crew: [],
      },
    ],
    credits: { cast: [], crew: [] },
  },
  seasonNumber: 1,
  country: "US",
  seasons: [
    {
      id: 101,
      season_number: 1,
      name: "Season 1",
      episode_count: 2,
      air_date: "2023-03-01",
      overview: "Season 1 overview",
      poster_path: null,
    },
  ],
};

const EPISODE_STATUS_RESPONSE = {
  episodes: [
    { episode_number: 1, id: 1001, is_watched: false },
    { episode_number: 2, id: 1002, is_watched: false },
  ],
};

async function setupSeasonMocks(page: SeasonDetailPage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ratings/**", (route) =>
    route.fulfill({ json: { ratings: {} } }),
  );
  await page.route("**/api/details/show/tv-tt9876543/season/1", (route) =>
    route.fulfill({ json: SEASON_DETAILS }),
  );
}

test.describe("Season detail page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: page loads with breadcrumb, season heading, and episode list", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await setupSeasonMocks(page);
    await mockLoggedOut(page);
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());

    await expect(sdp.heading()).toHaveText("Season 1");
    // Breadcrumb contains show link
    await expect(sdp.showBreadcrumb("Test Show")).toBeVisible();
    // Episodes section
    await expect(sdp.episodesHeading()).toBeVisible();
    // Two episodes rendered
    await expect(page.getByText("Pilot")).toBeVisible();
    await expect(page.getByText("Second Episode").first()).toBeVisible();
    // Season overview
    await expect(
      page.getByText("The first season of Test Show."),
    ).toBeVisible();
    // No redirect
    expect(page.url()).toContain("/season/1");
  });

  test("TC-02: episodes listed with correct numbers and titles", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await setupSeasonMocks(page);
    await mockLoggedOut(page);
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());

    // Episode number badges
    await expect(page.getByText("01").first()).toBeVisible();
    await expect(page.getByText("02").first()).toBeVisible();
    // Episode headings
    await expect(
      page.getByRole("heading", { name: "Pilot", level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Second Episode", level: 3 }),
    ).toBeVisible();
  });

  test("TC-03: unauthenticated user can view a season page (public route)", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await setupSeasonMocks(page);
    await mockLoggedOut(page);
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());

    expect(page.url()).toContain("/title/tv-tt9876543/season/1");
    await expect(sdp.heading()).toHaveText("Season 1");
    // No watched-pill buttons (hasStatus is false for logged-out users)
    await expect(
      page.getByRole("button", { name: /Mark as watched/i }),
    ).not.toBeVisible();
    // Sign In link present
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("TC-04: authenticated user sees watched-pill and can toggle episode watched", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/ratings/**", (route) =>
      route.fulfill({ json: { ratings: {} } }),
    );
    await page.route("**/api/episodes/status/tv-tt9876543/1", (route) =>
      route.fulfill({ json: EPISODE_STATUS_RESPONSE }),
    );
    await page.route("**/api/watched/**", (route) =>
      route.fulfill({ status: 200, json: {} }),
    );
    await page.route("**/api/details/show/tv-tt9876543/season/1", (route) =>
      route.fulfill({ json: SEASON_DETAILS }),
    );
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());

    // Watched pill buttons should appear for released episodes
    const watchPill = page
      .getByRole("button", { name: /Mark as watched/i })
      .first();
    await sdp.waitForVisible(watchPill);
    await expect(watchPill).toHaveAttribute("aria-pressed", "false");

    await watchPill.click();

    // After click, button should be in watched state
    await expect(
      page.getByRole("button", { name: /Watched/i }).first(),
    ).toBeVisible();
  });

  test("TC-05: authenticated user can mark all episodes watched", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    // Stateful status mock: initial state is unwatched; after bulk POST, return watched
    let allWatched = false;
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/ratings/**", (route) =>
      route.fulfill({ json: { ratings: {} } }),
    );
    await page.route("**/api/episodes/status/tv-tt9876543/1", (route) =>
      route.fulfill({
        json: {
          episodes: [
            { episode_number: 1, id: 1001, is_watched: allWatched },
            { episode_number: 2, id: 1002, is_watched: allWatched },
          ],
        },
      }),
    );
    await page.route("**/api/watched/bulk", (route) => {
      allWatched = true;
      route.fulfill({ status: 200, json: {} });
    });
    await page.route("**/api/details/show/tv-tt9876543/season/1", (route) =>
      route.fulfill({ json: SEASON_DETAILS }),
    );
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());
    await sdp.waitForVisible(sdp.markAllWatchedButton());

    // Initial counter: "0 of 2 watched · 2 remaining"
    await expect(page.getByText(/0\s+of\s+2\s+watched/)).toBeVisible();

    await sdp.markAllWatchedButton().click();

    // After marking all watched: counter updates to "2 of 2 watched · 0 remaining"
    // (optimistic update fires immediately; invalidation re-fetches the updated mock)
    await expect(page.getByText(/2\s+of\s+2\s+watched/)).toBeVisible();
    await expect(sdp.markAllUnwatchedButton()).toBeVisible();
  });

  test("TC-06: breadcrumb navigates back to title detail page", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await setupSeasonMocks(page);
    await mockLoggedOut(page);
    await sdp.goto("tv-tt9876543", 1);
    await sdp.waitForVisible(sdp.heading());

    await sdp.showBreadcrumb("Test Show").click();
    await page.waitForURL("**/title/tv-tt9876543**", { waitUntil: "commit" });

    expect(page.url()).toContain("/title/tv-tt9876543");
    await expect(sdp.heading()).not.toHaveText("Season 1");
  });

  test("TC-07: error state when season is not found (404)", async ({
    page,
  }) => {
    const sdp = new SeasonDetailPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedOut(page);
    await page.route("**/api/details/show/tv-tt9876543/season/99", (route) =>
      route.fulfill({ status: 404, json: { error: "Season not found" } }),
    );
    await sdp.goto("tv-tt9876543", 99);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Season not found")).toBeVisible();
  });
});
