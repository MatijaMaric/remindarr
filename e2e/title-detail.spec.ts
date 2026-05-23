import { test, expect } from "@playwright/test";
import {
  mockLoggedOut,
  mockLoggedIn,
  MOCK_MOVIE_DETAILS,
  MOCK_SHOW_DETAILS,
} from "./helpers";
import { TitleDetailPage } from "./pages/title-detail-page";

test.describe.configure({ mode: "serial" });

// Extended movie details fixture with overview
const MOVIE_DETAILS = {
  ...MOCK_MOVIE_DETAILS,
  title: {
    ...MOCK_MOVIE_DETAILS.title,
    is_tracked: false,
  },
};

// Already-tracked variant
const MOVIE_DETAILS_TRACKED = {
  ...MOCK_MOVIE_DETAILS,
  title: {
    ...MOCK_MOVIE_DETAILS.title,
    is_tracked: true,
  },
};

async function setupMovieMocks(
  page: TitleDetailPage["page"],
  details = MOVIE_DETAILS,
) {
  // Catch-all first (lowest priority)
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ratings/**", (route) =>
    route.fulfill({ json: { rating: null } }),
  );
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: { flat: [], groups: [] } }),
  );
  await page.route("**/api/watch-history**", (route) =>
    route.fulfill({ json: { history: [] } }),
  );
  await page.route("**/api/details/movie/tt1234567", (route) =>
    route.fulfill({ json: details }),
  );
}

async function setupShowMocks(page: TitleDetailPage["page"]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/ratings/**", (route) =>
    route.fulfill({ json: { rating: null } }),
  );
  await page.route("**/api/suggestions**", (route) =>
    route.fulfill({ json: { flat: [], groups: [] } }),
  );
  await page.route("**/api/watch-history**", (route) =>
    route.fulfill({ json: { history: [] } }),
  );
  await page.route("**/api/details/show/tv-tt9876543", (route) =>
    route.fulfill({ json: MOCK_SHOW_DETAILS }),
  );
}

test.describe("Title detail page", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: movie detail page loads title, metadata, and overview", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupMovieMocks(page);
    await mockLoggedOut(page);
    await tdp.goto("tt1234567");
    await tdp.waitForVisible(tdp.heading());

    await expect(tdp.heading()).toHaveText("Test Movie");
    await expect(page.getByText("Movie").first()).toBeVisible();
    await expect(page.getByText("2024").first()).toBeVisible();
    await expect(page.getByText("Action").first()).toBeVisible();
    await expect(page.getByText("Drama").first()).toBeVisible();
    await expect(
      page.getByText("A test movie description").first(),
    ).toBeVisible();
    // No redirect to /login
    expect(page.url()).toContain("/title/tt1234567");
  });

  test("TC-02: show detail page loads title, seasons grid, and metadata", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupShowMocks(page);
    await mockLoggedOut(page);
    await tdp.goto("tv-tt9876543");
    await tdp.waitForVisible(tdp.heading());

    await expect(tdp.heading()).toHaveText("Test Show");
    await expect(page.getByText("TV Show").first()).toBeVisible();
    await expect(tdp.seasonsHeading()).toBeVisible();
    await expect(page.getByText("Season 1").first()).toBeVisible();
  });

  test("TC-03: unauthenticated user can view a title detail page (public route)", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupMovieMocks(page);
    await mockLoggedOut(page);
    await tdp.goto("tt1234567");
    await tdp.waitForVisible(tdp.heading());

    // URL stays on title page
    expect(page.url()).toContain("/title/tt1234567");
    await expect(tdp.heading()).toHaveText("Test Movie");
    // Track button is hidden when logged out
    await expect(tdp.trackButton()).not.toBeVisible();
    // Sign In link is present
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("TC-04: authenticated user sees Track button and can track a title", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupMovieMocks(page);
    await mockLoggedIn(page);
    await page.route("**/api/track/tt1234567", (route) =>
      route.fulfill({ json: { id: "tt1234567", is_tracked: true } }),
    );
    await tdp.goto("tt1234567");
    await tdp.waitForVisible(tdp.heading());
    await tdp.waitForVisible(tdp.trackButton());

    await expect(tdp.trackButton()).toHaveAttribute("aria-pressed", "false");
    await tdp.trackButton().click();

    // Optimistic update — button becomes Tracked
    await expect(tdp.trackedButton()).toBeVisible();
    await expect(tdp.trackedButton()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Title tracked")).toBeVisible();
  });

  test("TC-05: authenticated user can untrack a title (confirm dialog)", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupMovieMocks(page, MOVIE_DETAILS_TRACKED);
    await mockLoggedIn(page);
    await page.route("**/api/track/tt1234567", (route) =>
      route.fulfill({ status: 200, json: {} }),
    );
    await tdp.goto("tt1234567");
    await tdp.waitForVisible(tdp.heading());
    await tdp.waitForVisible(tdp.trackedButton());

    await expect(tdp.trackedButton()).toHaveAttribute("aria-pressed", "true");
    await tdp.trackedButton().click();

    // Confirm dialog appears
    await expect(
      page.getByRole("dialog").or(page.getByText(/Stop tracking/i)),
    ).toBeVisible();
    await tdp.confirmUntrackButton().click();

    // After confirm, button reverts to Track
    await expect(tdp.trackButton()).toBeVisible();
    await expect(tdp.trackButton()).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Removed from tracked")).toBeVisible();
  });

  test("TC-06: error state when title is not found (404)", async ({ page }) => {
    const tdp = new TitleDetailPage(page);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await mockLoggedOut(page);
    await page.route("**/api/details/movie/tt0000000", (route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } }),
    );
    await tdp.goto("tt0000000");
    await page.waitForTimeout(1000);

    // fetchJson parses the error body — the error message shown is from the response
    // body ("Not found") rather than a generic fallback
    await expect(page.getByText(/Not found|Failed to load/i)).toBeVisible();
  });

  test("TC-07: clicking a season card navigates to season detail page", async ({
    page,
  }) => {
    const tdp = new TitleDetailPage(page);
    await setupShowMocks(page);
    await mockLoggedOut(page);
    await tdp.goto("tv-tt9876543");
    await tdp.waitForVisible(tdp.seasonsHeading());

    const season1Link = page.getByRole("link", { name: /Season 1/i }).first();
    await season1Link.click();
    // The Link uses title.id from the response ("tt9876543"), not the URL param ("tv-tt9876543")
    await page.waitForURL("**/season/1**", { waitUntil: "commit" });

    expect(page.url()).toContain("/season/1");
  });
});
