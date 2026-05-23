import { test, expect } from "@playwright/test";
import { mockLoggedOut } from "./helpers";
import {
  BrowsePage,
  MOCK_BROWSE_TITLE,
  MOCK_ACTION_TITLE,
  MOCK_NETFLIX_TITLE,
} from "./pages/browse-page";

test.describe("Browse", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "chromium only — desktop filter layout requires a stable viewport",
  );

  // ── TC-01: Browse page loads with header, category tabs, filter bar, title cards ──
  test("TC-01: browse page loads with header, category tabs, filter bar, and title cards", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    await page.goto("/browse");

    await expect(browse.browseHeading()).toBeVisible();

    // Kicker text above heading
    await expect(page.getByText(/Catalog/i)).toBeVisible();

    // Search bar
    await expect(
      page.getByPlaceholder(/Search titles or paste IMDB link/i),
    ).toBeVisible();

    // Category tab buttons
    await expect(browse.categoryButton("Popular")).toBeVisible();
    await expect(browse.categoryButton("Upcoming")).toBeVisible();
    await expect(browse.categoryButton("Top Rated")).toBeVisible();
    await expect(browse.categoryButton("Now Playing")).toBeVisible();

    // Filter dropdowns
    await expect(browse.genreDropdownButton()).toBeVisible();
    await expect(browse.providerDropdownButton()).toBeVisible();
    await expect(page.getByRole("button", { name: /Any year/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Any rating/i }),
    ).toBeVisible();

    // Content type group: All (pressed by default)
    const typeGroup = browse.contentTypeGroup();
    await expect(typeGroup).toBeVisible();
    await expect(
      typeGroup.getByRole("button", { name: /^All$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      typeGroup.getByRole("button", { name: /Movies/i }),
    ).toBeVisible();
    await expect(
      typeGroup.getByRole("button", { name: /Shows/i }),
    ).toBeVisible();

    // Title card for the mocked title
    await expect(browse.titleCard("Test Movie")).toBeVisible();

    // "Popular" heading above the title grid
    await expect(
      page.getByRole("heading", { name: "Popular", level: 2 }),
    ).toBeVisible();
  });

  // ── TC-02: Genre filter selects Action and updates results ──────────────────
  test("TC-02: genre filter re-queries API and updates results", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    // Override browse for genre=Action — registered AFTER so it wins (LIFO)
    await page.route("**/api/browse**", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("genre") === "Action") {
        return route.fulfill({
          json: {
            titles: [MOCK_ACTION_TITLE],
            page: 1,
            totalPages: 1,
            totalResults: 1,
          },
        });
      }
      return route.continue();
    });
    await page.goto("/browse");
    await expect(browse.browseHeading()).toBeVisible();

    // Open Genre dropdown
    await browse.genreDropdownButton().click();
    // Checklist should appear — click the Action checkbox
    await page.getByRole("checkbox", { name: "Action" }).click();
    // Close the dropdown
    await page.keyboard.press("Escape");

    // Active filter chip appears in the active-filters row (× is Unicode U+00D7)
    await expect(browse.activeFilterChip("Action ×")).toBeVisible();

    // New title appears; old title gone
    await expect(browse.titleCard("Action Movie")).toBeVisible();
    await expect(browse.titleCard("Test Movie")).not.toBeVisible();
  });

  // ── TC-03: Provider filter selects Netflix and updates results ──────────────
  test("TC-03: provider filter re-queries API and updates results", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    // Override browse for provider=8 — registered AFTER so it wins (LIFO)
    await page.route("**/api/browse**", (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("provider") === "8") {
        return route.fulfill({
          json: {
            titles: [MOCK_NETFLIX_TITLE],
            page: 1,
            totalPages: 1,
            totalResults: 1,
          },
        });
      }
      return route.continue();
    });
    await page.goto("/browse");
    await expect(browse.browseHeading()).toBeVisible();

    // Open Provider dropdown
    await browse.providerDropdownButton().click();
    // Click the Netflix checkbox
    await page.getByRole("checkbox", { name: "Netflix" }).click();
    // Close the dropdown
    await page.keyboard.press("Escape");

    // Active filter chip appears in the active-filters row (× is Unicode U+00D7)
    await expect(browse.activeFilterChip("Netflix ×")).toBeVisible();

    // Netflix Movie appears; Test Movie gone
    await expect(browse.titleCard("Netflix Movie")).toBeVisible();
    await expect(browse.titleCard("Test Movie")).not.toBeVisible();
  });

  // ── TC-04: Empty results show no-titles message ─────────────────────────────
  test("TC-04: empty results show no titles message", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    // Override browse with empty results — registered AFTER so it wins (LIFO)
    await page.route("**/api/browse**", (route) =>
      route.fulfill({
        json: { titles: [], page: 1, totalPages: 0, totalResults: 0 },
      }),
    );
    await page.goto("/browse");

    await expect(browse.browseHeading()).toBeVisible();

    // No article elements in the grid
    await expect(page.getByRole("article")).toHaveCount(0);

    // Empty state message from TitleList
    await expect(page.getByText("No titles found.")).toBeVisible();

    // Filter bar still rendered
    await expect(browse.categoryButton("Popular")).toBeVisible();
    await expect(browse.genreDropdownButton()).toBeVisible();

    // No error banner
    await expect(page.locator(".bg-red-900\\/50")).not.toBeVisible();
  });

  // ── TC-05: Unauthenticated user can access /browse (public page) ────────────
  test("TC-05: unauthenticated user can access /browse without redirect", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    await page.goto("/browse");

    // URL stays at /browse — no redirect to /login
    await expect(page).toHaveURL("/browse");
    await expect(browse.browseHeading()).toBeVisible();

    // Top nav shows "Sign In" link (not a user avatar)
    await expect(
      page
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: /sign in/i }),
    ).toBeVisible();

    // Title grid renders the mocked title
    await expect(browse.titleCard("Test Movie")).toBeVisible();
  });

  // ── TC-06: Clicking a title navigates to the title detail page ──────────────
  test("TC-06: clicking a title card navigates to the title detail page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const browse = new BrowsePage(page);
    await mockLoggedOut(page);
    await browse.mockBrowseDataEndpoints();
    // Stub details endpoint so the page doesn't get a 404/error (optional)
    await page.route("**/api/details/**", (route) =>
      route.fulfill({ json: null }),
    );
    await page.goto("/browse");
    await expect(browse.titleCard("Test Movie")).toBeVisible();

    // Click the title link inside the article
    await browse
      .titleCard("Test Movie")
      .getByRole("link", { name: "Test Movie" })
      .first()
      .click();

    await page.waitForURL(/\/title\/movie-12345/);
    await expect(page).toHaveURL(/\/title\/movie-12345/);

    // Browse heading and category tabs are no longer visible
    await expect(browse.browseHeading()).not.toBeVisible();
  });
});
