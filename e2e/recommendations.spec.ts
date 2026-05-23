import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { RecommendationsPage } from "./pages/recommendations-page";

test.describe.configure({ mode: "serial" });

const RECOMMENDATIONS_RESPONSE = {
  recommendations: [
    {
      id: "rec-1",
      from_user: {
        id: "user-2",
        username: "alice",
        display_name: "Alice",
        image: null,
      },
      title: {
        id: "tt9999001",
        title: "Recommended Show",
        object_type: "SHOW",
        poster_url: null,
      },
      message: "You will love this one!",
      created_at: "2026-05-20T10:00:00Z",
      read_at: null,
      is_targeted: false,
    },
  ],
  count: 1,
};

const MOVIE_TITLE = {
  id: "tt1234567",
  object_type: "MOVIE",
  title: "Test Movie",
  original_title: "Test Movie",
  release_year: 2023,
  release_date: "2023-06-01",
  runtime_minutes: 120,
  short_description: "A test movie.",
  genres: ["Action"],
  imdb_id: "tt1234567",
  tmdb_id: "12345",
  poster_url: null,
  age_certification: "PG-13",
  original_language: "en",
  tmdb_url: null,
  imdb_score: 7.5,
  imdb_votes: 100000,
  tmdb_score: 7.8,
  is_tracked: false,
  offers: [],
};

async function setupDiscoveryMocks(
  page: RecommendationsPage["page"],
  recommendationsResponse = RECOMMENDATIONS_RESPONSE,
  count = 1,
) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: { groups: [], flat: [] } }),
  );
  await page.route("**/api/recommendations/count", (route) =>
    route.fulfill({ json: { count } }),
  );
  await page.route("**/api/recommendations", (route) =>
    route.fulfill({ json: recommendationsResponse }),
  );
}

test.describe("Recommendations", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Discovery Activity tab loads and shows received recommendations", async ({
    page,
  }) => {
    const rp = new RecommendationsPage(page);
    await setupDiscoveryMocks(page, RECOMMENDATIONS_RESPONSE, 1);
    await mockLoggedIn(page);
    await rp.gotoDiscovery();
    await rp.waitForVisible(rp.forYouHeading());

    await rp.activityTab().click();
    await rp.waitForVisible(page.getByText("Alice"));

    // Sender name
    await expect(page.getByText("Alice")).toBeVisible();
    // Title
    await expect(page.getByText("Recommended Show").first()).toBeVisible();
    // Message
    await expect(page.getByText(/You will love this one!/)).toBeVisible();
    // Track and Dismiss buttons
    await expect(page.getByRole("button", { name: "Track" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dismiss" })).toBeVisible();
  });

  test("TC-02: Discovery page requires auth — unauthenticated redirect", async ({
    page,
  }) => {
    const rp = new RecommendationsPage(page);
    await mockLoggedOut(page);
    await rp.gotoDiscovery();
    await page.waitForURL(/\/(login|)$/, { waitUntil: "commit" });

    await expect(page.getByText("For you")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("TC-03: send recommendation from title detail page (broadcast to all followers)", async ({
    page,
  }) => {
    const rp = new RecommendationsPage(page);
    // Stateful: after POST, check returns recommended: true
    let recommended = false;
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/ratings/**", (route) =>
      route.fulfill({
        json: {
          user_rating: null,
          aggregated: { LOVE: 0, LIKE: 0, DISLIKE: 0, SKIP: 0 },
          friends_ratings: [],
        },
      }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/recommendations/check/tt1234567", (route) =>
      route.fulfill({
        json: { recommended, id: recommended ? "rec-new-1" : null },
      }),
    );
    await page.route("**/api/recommendations", (route) => {
      recommended = true;
      route.fulfill({ json: { id: "rec-new-1" } });
    });
    await page.route("**/api/details/movie/tt1234567", (route) =>
      route.fulfill({
        json: { title: MOVIE_TITLE, tmdb: null, country: "US" },
      }),
    );
    await mockLoggedIn(page);
    await rp.gotoTitle("tt1234567");
    await rp.waitForVisible(page.getByRole("heading", { level: 1 }));

    // Click Recommend button
    await rp.waitForVisible(rp.recommendButton());
    await rp.recommendButton().click();

    // Dialog opens
    await rp.waitForVisible(rp.recommendDialogHeading());
    await expect(rp.recommendDialogHeading()).toBeVisible();

    // All followers selected by default
    await expect(rp.audienceAllButton()).toBeVisible();

    // Send
    await rp.sendButton().click();

    // Success toast
    await expect(
      page.getByText(/Recommendation sent to all followers!/),
    ).toBeVisible();
    // Button now shows "Recommended"
    await rp.waitForVisible(rp.recommendedButton());
    await expect(rp.recommendedButton()).toBeVisible();
  });

  test("TC-04: empty state when no received recommendations", async ({
    page,
  }) => {
    const rp = new RecommendationsPage(page);
    await setupDiscoveryMocks(page, { recommendations: [], count: 0 }, 0);
    await mockLoggedIn(page);
    await rp.gotoDiscovery();
    await rp.waitForVisible(rp.forYouHeading());

    await rp.activityTab().click();
    await page.waitForTimeout(300);

    // No cards
    await expect(page.getByText("Alice")).not.toBeVisible();
    // Empty-state message
    await expect(page.getByText(/No recommendations yet/i)).toBeVisible();
  });

  test("TC-05: clicking a recommended title navigates to title detail", async ({
    page,
  }) => {
    const rp = new RecommendationsPage(page);
    await setupDiscoveryMocks(page, RECOMMENDATIONS_RESPONSE, 1);
    await mockLoggedIn(page);
    await rp.gotoDiscovery();
    await rp.waitForVisible(rp.forYouHeading());

    await rp.activityTab().click();
    await rp.waitForVisible(page.getByText("Recommended Show").first());

    await page.getByRole("link", { name: "Recommended Show" }).first().click();
    await page.waitForURL("**/title/tt9999001**", { waitUntil: "commit" });

    expect(page.url()).toContain("/title/tt9999001");
    await expect(rp.forYouHeading()).not.toBeVisible();
  });
});
