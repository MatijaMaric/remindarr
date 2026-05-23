import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { UserOverlapPage } from "./pages/user-overlap-page";

test.describe.configure({ mode: "serial" });

const OVERLAP_RESPONSE = {
  titles: [
    {
      id: "tt1234567",
      object_type: "MOVIE",
      title: "Inception",
      original_title: "Inception",
      release_year: 2010,
      release_date: "2010-07-16",
      runtime_minutes: 148,
      short_description: "A thief who steals corporate secrets.",
      genres: ["Action", "Sci-Fi"],
      imdb_id: "tt1375666",
      tmdb_id: "27205",
      poster_url: null,
      age_certification: "PG-13",
      original_language: "en",
      tmdb_url: null,
      imdb_score: 8.8,
      imdb_votes: 2000000,
      tmdb_score: 8.4,
      is_tracked: true,
      is_watched: true,
      offers: [],
      viewer_rating: "LOVE",
      friend_rating: "LIKE",
    },
    {
      id: "tt9876543",
      object_type: "SHOW",
      title: "Breaking Bad",
      original_title: "Breaking Bad",
      release_year: 2008,
      release_date: "2008-01-20",
      runtime_minutes: 47,
      short_description: "A chemistry teacher turned drug lord.",
      genres: ["Drama", "Crime"],
      imdb_id: "tt0903747",
      tmdb_id: "1396",
      poster_url: null,
      age_certification: "TV-MA",
      original_language: "en",
      tmdb_url: null,
      imdb_score: 9.5,
      imdb_votes: 1500000,
      tmdb_score: 9.3,
      is_tracked: true,
      is_watched: false,
      offers: [],
      viewer_rating: null,
      friend_rating: null,
    },
  ],
  sharedProviders: [],
  counts: {
    intersection: 2,
    viewerOnly: 3,
    friendOnly: 1,
  },
  friendUser: {
    username: "alice",
    displayName: "Alice",
    image: null,
  },
};

async function setupOverlapMocks(page: UserOverlapPage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/overlap/alice", (route) =>
    route.fulfill({ json: OVERLAP_RESPONSE }),
  );
}

test.describe("User Overlap page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: page loads showing shared titles and header avatars", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await setupOverlapMocks(page);
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(uop.heading());

    await expect(uop.heading()).toHaveText("What to watch together");
    await expect(page.getByText(/with @alice/i)).toBeVisible();
    // Viewer and friend avatar labels
    await expect(page.getByText("@testuser")).toBeVisible();
    await expect(page.getByRole("link", { name: "@alice" })).toBeVisible();
    // Counts
    await expect(page.getByText("2").first()).toBeVisible();
    await expect(page.getByText("3").first()).toBeVisible();
    // Titles
    await expect(page.getByText("Inception")).toBeVisible();
    await expect(page.getByText("Breaking Bad")).toBeVisible();
  });

  test("TC-02: auth required — unauthenticated user redirected to /login", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await mockLoggedOut(page);
    await uop.gotoOverlap("testuser", "alice");
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(page.getByText("What to watch together")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("TC-03: shows titles in common between the two users", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await setupOverlapMocks(page);
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(uop.heading());

    await expect(page.getByText("Inception")).toBeVisible();
    await expect(page.getByText("Breaking Bad")).toBeVisible();
    // Filter buttons
    await expect(uop.filterAll()).toBeVisible();
    await expect(uop.filterMoviesOnly()).toBeVisible();
    await expect(uop.filterWatchableNow()).toBeVisible();
  });

  test("TC-04: empty state when no titles in common", async ({ page }) => {
    const uop = new UserOverlapPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/overlap/alice", (route) =>
      route.fulfill({
        json: {
          titles: [],
          sharedProviders: [],
          counts: { intersection: 0, viewerOnly: 5, friendOnly: 3 },
          friendUser: { username: "alice", displayName: "Alice", image: null },
        },
      }),
    );
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(uop.heading());

    await expect(
      page.getByText(/don't have any titles in common yet/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /View @alice's profile/i }),
    ).toBeVisible();
    await expect(page.getByText("Inception")).not.toBeVisible();
  });

  test("TC-05: clicking a shared title navigates to title detail", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/details/movie/tt1234567", (route) =>
      route.fulfill({
        json: {
          title: OVERLAP_RESPONSE.titles[0],
          tmdb: null,
          country: "US",
        },
      }),
    );
    await page.route("**/api/overlap/alice", (route) =>
      route.fulfill({ json: OVERLAP_RESPONSE }),
    );
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(page.getByText("Inception"));

    await page
      .getByRole("link", { name: /Inception/i })
      .first()
      .click();
    await page.waitForURL("**/title/tt1234567**", { waitUntil: "commit" });

    expect(page.url()).toContain("/title/tt1234567");
  });

  test("TC-06: filter 'Movies only' hides shows", async ({ page }) => {
    const uop = new UserOverlapPage(page);
    await setupOverlapMocks(page);
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(uop.heading());

    await expect(page.getByText("Inception")).toBeVisible();
    await expect(page.getByText("Breaking Bad")).toBeVisible();

    await uop.filterMoviesOnly().click();

    await expect(page.getByText("Inception")).toBeVisible();
    await expect(page.getByText("Breaking Bad")).not.toBeVisible();
  });

  test("TC-07: shared streaming providers section visible when present", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/overlap/alice", (route) =>
      route.fulfill({
        json: {
          ...OVERLAP_RESPONSE,
          sharedProviders: [
            {
              id: 8,
              name: "Netflix",
              technical_name: "nfx",
              icon_url: "https://example.com/netflix.png",
            },
          ],
        },
      }),
    );
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await uop.waitForVisible(uop.heading());

    await expect(page.getByText(/Both subscribed to/i)).toBeVisible();
    await expect(page.getByText("Netflix")).toBeVisible();
    // Stats badge: "1 shared streaming services"
    await expect(page.getByText(/shared streaming services/i)).toBeVisible();
  });

  test("TC-08: private watchlist shows error with back-to-profile link", async ({
    page,
  }) => {
    const uop = new UserOverlapPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/overlap/alice", (route) =>
      route.fulfill({
        status: 403,
        json: { error: "This user's watchlist is private." },
      }),
    );
    await mockLoggedIn(page);
    await uop.gotoOverlap("testuser", "alice");
    await page.waitForTimeout(500);

    await expect(page.getByText(/watchlist is private/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to profile/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to profile/i }),
    ).toHaveAttribute("href", "/user/alice");
    await expect(page.getByText("Inception")).not.toBeVisible();
  });
});
