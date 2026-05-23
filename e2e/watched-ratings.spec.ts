import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { WatchedRatingsPage } from "./pages/watched-ratings-page";

test.describe.configure({ mode: "serial" });

const TRACKED_TITLES_RESPONSE = {
  titles: [
    {
      id: "tt9876543",
      object_type: "SHOW",
      title: "Test Show",
      original_title: "Test Show",
      release_year: 2023,
      release_date: "2023-03-01",
      runtime_minutes: 45,
      short_description: "A test show description",
      genres: ["Drama"],
      imdb_id: "tt9876543",
      tmdb_id: 98765,
      poster_url: null,
      age_certification: "TV-MA",
      original_language: "en",
      tmdb_url: "https://www.themoviedb.org/tv/98765",
      imdb_score: 8.2,
      imdb_votes: 50000,
      tmdb_score: 8.5,
      is_tracked: true,
      tracked_at: "2024-01-10T00:00:00Z",
      offers: [],
      user_status: "watching",
      show_status: "watching",
      watched_episodes_count: 5,
      total_episodes: 8,
      released_episodes_count: 8,
      next_episode_air_date: null,
      latest_released_air_date: "2023-05-01",
    },
  ],
  count: 1,
  profile_public: true,
  profile_visibility: "public",
};

async function setupTrackedMocks(page: WatchedRatingsPage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/track", (route) =>
    route.fulfill({ json: TRACKED_TITLES_RESPONSE }),
  );
}

test.describe("Watched / Ratings (TrackedPage)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: tracked page loads and shows tracked titles in list view", async ({
    page,
  }) => {
    const wrp = new WatchedRatingsPage(page);
    await setupTrackedMocks(page);
    await mockLoggedIn(page);
    await wrp.gotoTracked();
    await wrp.waitForVisible(wrp.heading());

    await expect(wrp.heading()).toBeVisible();
    // Kicker: "Your library · 1 title"
    await expect(page.getByText(/Your library · 1 title/)).toBeVisible();
    // Stats band labels
    await expect(page.getByText("Currently watching")).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("Avg score")).toBeVisible();
    await expect(page.getByText("Total tracked")).toBeVisible();
    // Title row
    await expect(page.getByText("Test Show").first()).toBeVisible();
  });

  test("TC-02: tracked page — auth required (unauthenticated redirect)", async ({
    page,
  }) => {
    const wrp = new WatchedRatingsPage(page);
    await mockLoggedOut(page);
    await wrp.gotoTracked();
    await page.waitForURL(/\/(login|)$/, { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(page.getByText("Tracked")).not.toBeVisible();
  });

  test("TC-03: rating displayed for a title with an IMDB score", async ({
    page,
  }) => {
    const wrp = new WatchedRatingsPage(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupTrackedMocks(page);
    await mockLoggedIn(page);
    await wrp.gotoTracked();
    await wrp.waitForVisible(wrp.heading());
    await wrp.waitForVisible(page.getByText("Test Show").first());

    // Rating column shows ★ 8.2 (also appears in avg-score stats card)
    await expect(page.getByText("★ 8.2").first()).toBeVisible();
  });

  test("TC-04: empty state — no tracked titles", async ({ page }) => {
    const wrp = new WatchedRatingsPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/track", (route) =>
      route.fulfill({
        json: {
          titles: [],
          count: 0,
          profile_public: true,
          profile_visibility: "public",
        },
      }),
    );
    await mockLoggedIn(page);
    await wrp.gotoTracked();
    await wrp.waitForVisible(wrp.heading());

    await expect(page.getByText(/Your library · 0 titles/)).toBeVisible();
    await expect(page.getByText(/No tracked titles yet/i)).toBeVisible();
    await expect(page.getByText("Total tracked")).toBeVisible();
  });

  test("TC-05: clicking a title in the list navigates to title detail", async ({
    page,
  }) => {
    const wrp = new WatchedRatingsPage(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupTrackedMocks(page);
    await mockLoggedIn(page);
    await wrp.gotoTracked();
    await wrp.waitForVisible(wrp.heading());
    await wrp.waitForVisible(page.getByText("Test Show").first());

    await page.getByRole("link", { name: "Test Show" }).first().click();
    await page.waitForURL("**/title/tt9876543**", { waitUntil: "commit" });

    expect(page.url()).toContain("/title/tt9876543");
  });
});
