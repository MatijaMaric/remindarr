import { test, expect } from "@playwright/test";
import {
  MOCK_SEARCH_TITLE,
  MOCK_MOVIE_DETAILS,
  MOCK_SHOW_DETAILS,
  MOCK_SHOW,
  mockLoggedOut,
  mockLoggedIn,
  mockTitleEndpoints,
  mockBrowseEndpoints,
} from "./helpers";

test.describe("Search and title details", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedOut(page);
    await mockTitleEndpoints(page);
    await mockBrowseEndpoints(page);
  });

  test("shows search bar on browse page", async ({ page }) => {
    await page.goto("/browse");

    await expect(
      page.getByPlaceholder(/search titles or paste imdb link/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^search$/i })
    ).toBeVisible();
  });

  test("search button is disabled when input is empty", async ({ page }) => {
    await page.goto("/browse");

    await expect(
      page.getByRole("button", { name: /^search$/i })
    ).toBeDisabled();
  });

  test("displays search results when query is submitted", async ({ page }) => {
    await page.route("**/api/search**", (route) =>
      route.fulfill({
        json: { titles: [MOCK_SEARCH_TITLE], count: 1 },
      })
    );

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText("Test Movie")).toBeVisible();
  });

  test("shows 'no results' when search returns empty", async ({ page }) => {
    await page.route("**/api/search**", (route) =>
      route.fulfill({ json: { titles: [], count: 0 } })
    );

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("nonexistent movie xyz");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByText(/no results found/i)).toBeVisible();
  });

  test("navigates to movie detail page when title is clicked", async ({ page }) => {
    await page.route("**/api/search**", (route) =>
      route.fulfill({ json: { titles: [MOCK_SEARCH_TITLE], count: 1 } })
    );
    await page.route("**/api/details/movie/tt1234567", (route) =>
      route.fulfill({ json: MOCK_MOVIE_DETAILS })
    );

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    // Click on the title link
    await page.getByRole("link", { name: /test movie/i }).first().click();

    await expect(page).toHaveURL(/\/title\/tt1234567/);
  });

  test("displays movie details on detail page", async ({ page }) => {
    await page.route("**/api/details/movie/tt1234567", (route) =>
      route.fulfill({ json: MOCK_MOVIE_DETAILS })
    );

    await page.goto("/title/tt1234567");

    await expect(page.getByRole("heading", { name: /test movie/i })).toBeVisible();
  });

  test("displays show details on detail page", async ({ page }) => {
    // TitleDetailPage tries movie first, then show if object_type === "SHOW"
    await page.route("**/api/details/movie/tt9876543", (route) =>
      route.fulfill({ json: MOCK_SHOW_DETAILS })
    );
    await page.route("**/api/details/show/tt9876543", (route) =>
      route.fulfill({ json: MOCK_SHOW_DETAILS })
    );

    await page.goto("/title/tt9876543");

    await expect(page.getByRole("heading", { name: /test show/i })).toBeVisible();
  });

  test("shows 'Track' button on title card for logged-in user", async ({ page }) => {
    await mockLoggedIn(page);
    await page.route("**/api/search**", (route) =>
      route.fulfill({ json: { titles: [MOCK_SEARCH_TITLE], count: 1 } })
    );

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByRole("button", { name: /^track$/i })).toBeVisible();
  });

  test("does not show 'Track' button for logged-out user", async ({ page }) => {
    await page.route("**/api/search**", (route) =>
      route.fulfill({ json: { titles: [MOCK_SEARCH_TITLE], count: 1 } })
    );

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByRole("button", { name: /^track$/i })).not.toBeVisible();
  });

  test("resolves IMDB URL and shows title in search results", async ({ page }) => {
    await page.route("**/api/imdb", (route) =>
      route.fulfill({
        json: { success: true, title: MOCK_SEARCH_TITLE },
      })
    );

    await page.goto("/browse");
    await page
      .getByPlaceholder(/search titles or paste imdb link/i)
      .fill("https://www.imdb.com/title/tt1234567");
    await page.getByRole("button", { name: /^search$/i }).click();

    // After IMDB resolution the title appears in search results
    await expect(page.getByText("Test Movie")).toBeVisible();
    await expect(page.getByText(/search results/i)).toBeVisible();
  });

  test("displays show seasons list on show detail page", async ({ page }) => {
    await page.route("**/api/details/movie/tt9876543", (route) =>
      route.fulfill({ json: MOCK_SHOW_DETAILS })
    );
    await page.route("**/api/details/show/tt9876543", (route) =>
      route.fulfill({ json: MOCK_SHOW_DETAILS })
    );

    await page.goto("/title/tt9876543");

    await expect(page.getByText(/season 1/i)).toBeVisible();
  });
});
