import { test, expect } from "@playwright/test";
import { mockLoggedOut } from "./helpers";
import { SharedWatchlistPage } from "./pages/shared-watchlist-page";

test.describe.configure({ mode: "serial" });

const MOCK_TITLE = {
  id: "tt1234567",
  object_type: "MOVIE",
  title: "Test Movie",
  original_title: "Test Movie",
  release_year: 2024,
  release_date: "2024-01-15",
  runtime_minutes: 120,
  short_description: "A test movie",
  genres: ["Action"],
  imdb_id: "tt1234567",
  tmdb_id: 12345,
  poster_url: null,
  age_certification: "PG-13",
  original_language: "en",
  tmdb_url: "https://www.themoviedb.org/movie/12345",
  imdb_score: 7.5,
  imdb_votes: 10000,
  tmdb_score: 7.8,
  is_tracked: false,
  offers: [],
};

const STANDARD_WATCHLIST = {
  username: "alice",
  titles: [MOCK_TITLE],
};

async function setupPublicShellMocks(page: SharedWatchlistPage["page"]) {
  // Auth shell — public page, no session required.
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: { local: true, oidc: null } }),
  );
}

test.describe("Shared Watchlist page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Page loads and shows the owner's titles", async ({ page }) => {
    const swp = new SharedWatchlistPage(page);
    await setupPublicShellMocks(page);
    await page.route("**/api/share/watchlist/valid-token-abc**", (route) =>
      route.fulfill({ json: STANDARD_WATCHLIST }),
    );

    await swp.gotoWatchlist("valid-token-abc");
    await swp.waitForVisible(swp.heading());

    // Heading with count and username
    await expect(swp.heading()).toContainText("1 title");
    await expect(swp.heading()).toContainText("shared by");
    await expect(page.getByText("@alice")).toBeVisible();

    // Read-only subtitle
    await expect(
      page.getByText("Read-only view — sign in to track these titles"),
    ).toBeVisible();

    // Title card for Test Movie
    await expect(page.getByText("Test Movie").first()).toBeVisible();
    await expect(page.getByText("2024")).toBeVisible();

    // Footer
    await expect(swp.poweredByLink()).toBeVisible();

    // No error state
    await expect(swp.errorHeading()).not.toBeVisible();
  });

  test("TC-02: Page is accessible without authentication", async ({ page }) => {
    const swp = new SharedWatchlistPage(page);
    await mockLoggedOut(page);
    await page.route("**/api/share/watchlist/public-token**", (route) =>
      route.fulfill({ json: STANDARD_WATCHLIST }),
    );

    await swp.gotoWatchlist("public-token");
    await swp.waitForVisible(swp.heading());

    // URL remains on the watchlist page — no redirect to /login
    expect(page.url()).toContain("/share/watchlist/public-token");

    // Owner username visible
    await expect(page.getByText("@alice")).toBeVisible();

    // Sign In link visible (unauthenticated nav)
    await expect(
      page.getByRole("link", { name: /sign in/i }).first(),
    ).toBeVisible();
  });

  test("TC-03: Invalid or revoked token shows the error state", async ({
    page,
  }) => {
    const swp = new SharedWatchlistPage(page);
    await setupPublicShellMocks(page);
    await page.route("**/api/share/watchlist/bad-token**", (route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } }),
    );

    await swp.gotoWatchlist("bad-token");
    await swp.waitForVisible(swp.errorHeading());

    await expect(swp.errorHeading()).toBeVisible();
    await expect(
      page.getByText(
        "The watchlist you are looking for is no longer available.",
      ),
    ).toBeVisible();
    await expect(swp.goToRemindarrLink()).toBeVisible();
    await expect(swp.goToRemindarrLink()).toHaveAttribute("href", "/");

    // No title grid
    await expect(page.getByText("@alice")).not.toBeVisible();
  });

  test("TC-04: Empty watchlist shows the empty-state message", async ({
    page,
  }) => {
    const swp = new SharedWatchlistPage(page);
    await setupPublicShellMocks(page);
    await page.route("**/api/share/watchlist/empty-token**", (route) =>
      route.fulfill({ json: { username: "bob", titles: [] } }),
    );

    await swp.gotoWatchlist("empty-token");
    await swp.waitForVisible(swp.heading());

    // Heading shows 0 titles and @bob
    await expect(swp.heading()).toContainText("0 title");
    await expect(page.getByText("@bob")).toBeVisible();

    // Empty state message
    await expect(swp.emptyState()).toBeVisible();

    // No title cards
    await expect(page.getByText("Test Movie")).not.toBeVisible();

    // Footer still present
    await expect(swp.poweredByLink()).toBeVisible();
  });

  test("TC-05: Clicking a title card navigates to the title detail page", async ({
    page,
  }) => {
    const swp = new SharedWatchlistPage(page);
    await setupPublicShellMocks(page);
    await page.route("**/api/share/watchlist/nav-token**", (route) =>
      route.fulfill({ json: STANDARD_WATCHLIST }),
    );

    await swp.gotoWatchlist("nav-token");
    await swp.waitForVisible(swp.heading());

    // Title card link is present with href to /title/tt1234567
    const titleLink = page.getByRole("link", { name: "Test Movie" }).first();
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute("href", "/title/tt1234567");

    // Navigate via click and check URL
    await titleLink.click();
    await page.waitForURL("**/title/tt1234567**", { waitUntil: "commit" });
    expect(page.url()).toContain("/title/tt1234567");
  });

  test("TC-06: Loading skeleton is shown while the API request is in flight", async ({
    page,
  }) => {
    const swp = new SharedWatchlistPage(page);
    await setupPublicShellMocks(page);

    // Delayed mock to keep the loading state visible
    await page.route("**/api/share/watchlist/slow-token**", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ json: STANDARD_WATCHLIST });
    });

    // Start navigation without waiting
    void swp.gotoWatchlist("slow-token");

    // While loading: skeleton pulse element visible, heading not yet present
    await expect(page.locator(".animate-pulse").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(swp.heading()).not.toBeVisible();

    // After loading: heading appears and skeleton gone
    await swp.waitForVisible(swp.heading());
    await expect(swp.heading()).toContainText("1 title");
  });
});
