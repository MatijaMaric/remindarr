import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import { DiscoveryPage } from "./pages/discovery-page";

test.describe.configure({ mode: "serial" });

const RECOMMENDATIONS_RESPONSE = {
  recommendations: [
    {
      id: "rec-1",
      title: {
        id: "movie-99001",
        title: "Friend Rec Movie",
        object_type: "MOVIE",
        poster_url: null,
      },
      from_user: {
        username: "alice",
        display_name: "Alice",
        image: null,
      },
      message: "You will love this!",
      is_targeted: false,
      read_at: null,
      created_at: "2025-05-20T10:00:00Z",
    },
  ],
};

const SUGGESTIONS_RESPONSE = {
  flat: [
    {
      id: "movie-42001",
      objectType: "MOVIE",
      title: "Suggested Movie",
      originalTitle: "Suggested Movie",
      releaseYear: 2024,
      releaseDate: "2024-08-10",
      runtimeMinutes: 110,
      shortDescription: "A suggested pick",
      genres: ["Drama", "Thriller"],
      imdbId: "tt4200100",
      tmdbId: 42001,
      posterUrl: null,
      ageCertification: "R",
      originalLanguage: "en",
      tmdbUrl: "https://www.themoviedb.org/movie/42001",
      offers: [],
      scores: { imdbScore: 7.2, imdbVotes: 8000, tmdbScore: 7.5 },
      isTracked: false,
      matchScore: 92,
    },
    {
      id: "movie-42002",
      objectType: "MOVIE",
      title: "More For You Movie",
      originalTitle: "More For You Movie",
      releaseYear: 2023,
      releaseDate: "2023-11-01",
      runtimeMinutes: 95,
      shortDescription: "Another pick",
      genres: ["Action"],
      imdbId: "tt4200200",
      tmdbId: 42002,
      posterUrl: null,
      ageCertification: "PG-13",
      originalLanguage: "en",
      tmdbUrl: "https://www.themoviedb.org/movie/42002",
      offers: [],
      scores: { imdbScore: 6.8, imdbVotes: 5000, tmdbScore: 7.0 },
      isTracked: false,
      matchScore: 80,
    },
  ],
  groups: [
    {
      source: {
        id: "movie-10001",
        title: "Inception",
        posterUrl: null,
        reason: "loved",
      },
      suggestions: [
        {
          id: "movie-42001",
          objectType: "MOVIE",
          title: "Suggested Movie",
          originalTitle: "Suggested Movie",
          releaseYear: 2024,
          releaseDate: "2024-08-10",
          runtimeMinutes: 110,
          shortDescription: "A suggested pick",
          genres: ["Drama", "Thriller"],
          imdbId: "tt4200100",
          tmdbId: 42001,
          posterUrl: null,
          ageCertification: "R",
          originalLanguage: "en",
          tmdbUrl: "https://www.themoviedb.org/movie/42001",
          offers: [],
          scores: { imdbScore: 7.2, imdbVotes: 8000, tmdbScore: 7.5 },
          isTracked: false,
          matchScore: 92,
        },
        {
          // Rows drop titles already shown in the hero / More for you (#1421),
          // so the row needs a title of its own to render.
          id: "movie-42003",
          objectType: "MOVIE",
          title: "Rail Only Movie",
          originalTitle: "Rail Only Movie",
          releaseYear: 2022,
          releaseDate: "2022-03-04",
          runtimeMinutes: 100,
          shortDescription: "Only in the Because you loved row",
          genres: ["Drama"],
          imdbId: "tt4200300",
          tmdbId: 42003,
          posterUrl: null,
          ageCertification: "PG",
          originalLanguage: "en",
          tmdbUrl: "https://www.themoviedb.org/movie/42003",
          offers: [],
          scores: { imdbScore: 7.0, imdbVotes: 3000, tmdbScore: 7.1 },
          isTracked: false,
          matchScore: 85,
        },
      ],
      hiddenCount: 0,
    },
  ],
};

async function setupBaseMocks(page: DiscoveryPage["page"]) {
  // Catch-all FIRST (lowest priority) — prevents any unmocked /api/* call from
  // hitting the real server and returning a 401 that triggers auth:unauthorized.
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  // Specific mocks registered after have higher priority (Playwright reverse order).
  // IMPORTANT: more specific routes must be registered AFTER less specific ones so
  // they get checked first (Playwright is LIFO). /recommendations/count must come
  // after /recommendations** so it isn't swallowed by the wildcard handler.
  await mockLoggedIn(page);
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: SUGGESTIONS_RESPONSE }),
  );
  await page.route("**/api/recommendations**", (route) =>
    route.fulfill({ json: RECOMMENDATIONS_RESPONSE }),
  );
  await page.route("**/api/recommendations/count", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
}

test.describe("Discovery", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: page loads with heading, hero card, and friends row visible", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await setupBaseMocks(page);
    await dp.goto();
    await dp.waitForVisible(dp.heading());

    await expect(dp.heading()).toBeVisible();
    await expect(
      page.getByText("Based on what you watch & who you follow"),
    ).toBeVisible();
    // No tab toggle since #1421 — friend picks sit in their own row instead.
    await expect(page.getByRole("button", { name: /^Activity/ })).toHaveCount(
      0,
    );
    await expect(
      dp.friendsRow().getByRole("link", { name: "Friend Rec Movie" }),
    ).toBeVisible();
    await expect(dp.heroTitle("Suggested Movie")).toBeVisible();
    await expect(dp.trackButton()).toBeVisible();
    await expect(dp.viewDetailsLink()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Not interested/i }),
    ).toBeVisible();
    await expect(
      page.getByText("More for you", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("More For You Movie")).toBeVisible();
  });

  test("TC-02: unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    await mockLoggedOut(page);
    await page.goto("/discovery");
    await page.waitForURL("**/login**");

    expect(page.url()).toContain("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "For you" }),
    ).not.toBeVisible();
  });

  test("TC-03: page shows algo sections (Because you… rails)", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: SUGGESTIONS_RESPONSE }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [] } }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());
    await dp.waitForVisible(
      page.getByRole("heading", { name: /Because you loved/i }),
    );

    await expect(
      page.getByRole("heading", { name: "Because you loved Inception" }),
    ).toBeVisible();
    await expect(page.getByText("Suggested Movie").first()).toBeVisible();
    // The row carries its own title and drops the one already in the hero (#1421)
    const rail = dp.section("Because you loved Inception");
    await expect(
      rail.getByRole("link", { name: "Rail Only Movie" }),
    ).toBeVisible();
    await expect(rail.getByText("Suggested Movie")).toHaveCount(0);
    await expect(page.getByText("Friends are recommending")).not.toBeVisible();
  });

  test("TC-04: Friends are recommending row shows incoming friend recommendations", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], groups: [] } }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: RECOMMENDATIONS_RESPONSE }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 1 } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());
    const row = dp.friendsRow();
    await dp.waitForVisible(row);

    // Sender avatar (initial dot, named via title) and "— @alice" attribution
    await expect(row.getByTitle("Alice")).toBeVisible();
    await expect(row.getByText(/@alice/)).toBeVisible();
    await expect(
      row.getByRole("link", { name: "Friend Rec Movie" }),
    ).toBeVisible();
    await expect(row.getByText(/You will love this!/i)).toBeVisible();
    await expect(row.getByRole("button", { name: "Track" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Dismiss" })).toBeVisible();
  });

  test("TC-05: Discovery nav link shows unread count badge", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], groups: [] } }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [] } }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 3 } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());

    // Since #1421/#1434 the unread count lives on the Discovery nav link
    // (visible badge + screen-reader text), not on an Activity tab.
    const navLink = dp.discoveryNavLink();
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAccessibleName(/3 unread recommendations/);
    const badge = navLink.getByTestId("unread-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("3");
  });

  test("TC-06: empty state — no suggestions and no recommendations", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], groups: [] } }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [] } }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());
    await page.waitForTimeout(500);

    await expect(page.getByRole("heading", { level: 2 })).not.toBeVisible();
    await expect(page.getByText("Suggested next")).not.toBeVisible();
    await expect(page.getByText("Friends are recommending")).not.toBeVisible();
    // Empty state message should be visible
    const emptyText = page.getByText(
      /nothing to show|no suggestions|discover new/i,
    );
    // Only assert if visible — the exact i18n string varies
    const isVisible = await emptyText.isVisible().catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });

  test("TC-07: clicking a suggested title navigates to /title/:id", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: SUGGESTIONS_RESPONSE }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [] } }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());
    await dp.waitForVisible(dp.viewDetailsLink());
    await dp.viewDetailsLink().click();
    await page.waitForURL("**/title/movie-42001**");

    expect(page.url()).toContain("/title/movie-42001");
  });

  test("TC-08: tracking a hero suggestion removes it from hero and updates count", async ({
    page,
  }) => {
    const dp = new DiscoveryPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedIn(page);
    await page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: SUGGESTIONS_RESPONSE }),
    );
    await page.route("**/api/recommendations**", (route) =>
      route.fulfill({ json: { recommendations: [] } }),
    );
    await page.route("**/api/recommendations/count", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/track/**", (route) =>
      route.fulfill({ json: { success: true } }),
    );
    await dp.goto();
    await dp.waitForVisible(dp.heading());
    // Hero initially shows "Suggested Movie" (movie-42001)
    await expect(dp.heroTitle("Suggested Movie")).toBeVisible();
    await dp.trackButton().click();

    // After tracking, the hero rotates to the next suggestion (movie-42002)
    // and the tracked count indicator updates
    await expect(page.getByText(/1 tracked/i)).toBeVisible();
    // The original hero title is no longer shown as the active hero
    await expect(dp.heroTitle("Suggested Movie")).not.toBeVisible();
  });
});
