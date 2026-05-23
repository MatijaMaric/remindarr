import { test, expect } from "@playwright/test";
import {
  mockLoggedIn,
  mockLoggedOut,
  MOCK_EPISODE,
  MOCK_UPCOMING_EPISODE,
  MOCK_SEARCH_TITLE,
} from "./helpers";
import { HomePage } from "./pages/home-page";

test.describe("Home", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop layout requires a stable viewport",
  );

  // ── TC-01: Authenticated user sees the home page ──────────────────────────
  test("TC-01: authenticated user sees the home page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const home = new HomePage(page);
    await mockLoggedIn(page);
    await home.mockHomeDataEndpoints();
    await home.gotoHome();

    await expect(page).toHaveTitle(/remindarr/i);
    // Unauthenticated hero should NOT be visible
    await expect(
      page.getByRole("heading", { name: /track movies.*tv shows/i }),
    ).not.toBeVisible();
    // Main content area should be present
    await expect(page.locator("main")).toBeVisible();
    // Top nav has a Home link
    await expect(
      page
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: /home/i }),
    ).toBeVisible();
    // No error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-02: Home page shows tracked titles list (upcoming episodes) ────────
  test("TC-02: shows today's airing episode", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const home = new HomePage(page);
    await mockLoggedIn(page);
    // Register base mocks first (includes empty episodes fallback)
    await home.mockHomeDataEndpoints();
    // Override episodes with today's episode — registered AFTER so it wins (LIFO)
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [MOCK_EPISODE], upcoming: [], unwatched: [] },
      }),
    );
    await home.gotoHome();

    await expect(page.locator("main")).toBeVisible();
    // "Today" section heading from t("home.today")
    await expect(page.getByRole("heading", { name: /today/i })).toBeVisible();
    // Show title appears
    await expect(page.getByText(MOCK_EPISODE.show_title)).toBeVisible();
    // Episode code chip e.g. "S01·E01"
    await expect(page.getByText(/S01[·\s]?E01/)).toBeVisible();
  });

  // ── TC-03: Home page shows upcoming episodes section ──────────────────────
  test("TC-03: shows upcoming episodes section", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const home = new HomePage(page);
    await mockLoggedIn(page);
    await home.mockHomeDataEndpoints();
    // Override episodes with upcoming episode — registered AFTER so it wins (LIFO)
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [], upcoming: [MOCK_UPCOMING_EPISODE], unwatched: [] },
      }),
    );
    await home.gotoHome();

    await expect(page.locator("main")).toBeVisible();
    // "Coming Up" section heading from t("home.comingUp")
    await expect(
      page.getByRole("heading", { name: /coming up/i }),
    ).toBeVisible();
    // Show title appears
    await expect(
      page.getByText(MOCK_UPCOMING_EPISODE.show_title),
    ).toBeVisible();
    // Episode code chip e.g. "S01·E02"
    await expect(page.getByText(/S01[·\s]?E02/)).toBeVisible();
  });

  // ── TC-04: Empty state — no tracked titles ────────────────────────────────
  test("TC-04: empty state shows no episodes message", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const home = new HomePage(page);
    await mockLoggedIn(page);
    // mockHomeDataEndpoints stubs episodes/upcoming with empty arrays
    await home.mockHomeDataEndpoints();
    await home.gotoHome();

    await expect(page.locator("main")).toBeVisible();
    // "Today" section kicker "Airing tonight" is rendered as a div (Kicker component)
    await expect(page.getByText(/airing tonight/i)).toBeVisible();
    // Empty state message — t("home.noEpisodes") when all lists empty
    await expect(page.getByText(/no upcoming episodes/i)).toBeVisible();
    // No JS error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-05: Unauthenticated user sees the landing page ────────────────────
  test("TC-05: unauthenticated user sees landing page", async ({ page }) => {
    const home = new HomePage(page);
    await mockLoggedOut(page);
    // Browse endpoint for Popular Right Now section
    await page.route("**/api/browse**", (route) =>
      route.fulfill({
        json: {
          titles: [MOCK_SEARCH_TITLE],
          page: 1,
          totalPages: 1,
          totalResults: 1,
          availableGenres: [],
          availableProviders: [],
          availableLanguages: [],
        },
      }),
    );
    await home.gotoHome();

    // Hero heading visible
    await expect(
      page.getByRole("heading", { name: /track movies.*tv shows/i }),
    ).toBeVisible();
    // Sign In link in main content area (scoped to avoid strict mode with nav link)
    await expect(
      page.locator("#main-content").getByRole("link", { name: /sign in/i }),
    ).toBeVisible();
    // Create Account link to /signup
    await expect(
      page.getByRole("link", { name: /create account/i }),
    ).toBeVisible();
    // Popular Right Now section
    await expect(
      page.getByRole("heading", { name: /popular right now/i }),
    ).toBeVisible();
    // URL remains /
    await expect(page).toHaveURL("/");
  });

  // ── TC-06: Navigation — home is accessible from the nav bar ──────────────
  test("TC-06: Home nav link navigates to home", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const home = new HomePage(page);
    await mockLoggedIn(page);
    await home.mockHomeDataEndpoints();
    // Stub browse so /browse can render without hitting real backend
    await page.route("**/api/browse**", (route) =>
      route.fulfill({
        json: {
          titles: [],
          page: 1,
          totalPages: 0,
          totalResults: 0,
          availableGenres: [],
          availableProviders: [],
          availableLanguages: [],
        },
      }),
    );
    await page.route("**/api/titles/genres", (route) =>
      route.fulfill({ json: { genres: [] } }),
    );
    await page.route("**/api/titles/providers", (route) =>
      route.fulfill({ json: { providers: [], regionProviderIds: [] } }),
    );
    await page.route("**/api/titles/languages", (route) =>
      route.fulfill({ json: { languages: [], priorityLanguageCodes: [] } }),
    );

    // Navigate away from home first
    await page.goto("/browse");
    await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();

    // Click Home nav link
    const nav = page.getByRole("navigation", { name: /main navigation/i });
    await nav.getByRole("link", { name: /home/i }).click();
    await page.waitForURL("/");

    await expect(page).toHaveURL("/");
    // Main content visible (authenticated home, not landing)
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /track movies.*tv shows/i }),
    ).not.toBeVisible();
  });
});
