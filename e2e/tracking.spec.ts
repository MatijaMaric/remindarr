import { test, expect } from "@playwright/test";
import {
  MOCK_TITLE,
  MOCK_TRACKED_TITLE,
  MOCK_SEARCH_TITLE,
  mockLoggedIn,
  mockTitleEndpoints,
  mockBrowseEndpoints,
} from "./helpers";

test.describe("Track and untrack titles", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
    await mockBrowseEndpoints(page);
  });

  test("tracks a title from search results", async ({ page }) => {
    let isTracked = false;
    await page.route("**/api/search**", (route) =>
      route.fulfill({
        json: {
          titles: [{ ...MOCK_SEARCH_TITLE, isTracked }],
          count: 1,
        },
      })
    );
    await page.route("**/api/track/tt1234567", async (route) => {
      if (route.request().method() === "POST") {
        isTracked = true;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });
    await mockTitleEndpoints(page);

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    const trackButton = page.getByRole("button", { name: /^track$/i });
    await expect(trackButton).toBeVisible();
    await trackButton.click();

    // Button should change to "Tracked"
    await expect(page.getByRole("button", { name: /^tracked$/i })).toBeVisible();
  });

  test("untracks a tracked title", async ({ page }) => {
    let isTracked = true;
    await page.route("**/api/search**", (route) =>
      route.fulfill({
        json: {
          titles: [{ ...MOCK_SEARCH_TITLE, isTracked }],
          count: 1,
        },
      })
    );
    // The TitleList uses normalizeSearchTitle which converts isTracked -> is_tracked
    await page.route("**/api/track/tt1234567", async (route) => {
      if (route.request().method() === "DELETE") {
        isTracked = false;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });
    await mockTitleEndpoints(page);

    await page.goto("/browse");
    await page.getByPlaceholder(/search titles or paste imdb link/i).fill("Test Movie");
    await page.getByRole("button", { name: /^search$/i }).click();

    // Title is already tracked, button shows "Tracked"
    const trackedButton = page.getByRole("button", { name: /^tracked$/i });
    await expect(trackedButton).toBeVisible();
    await trackedButton.click();

    // After untrack, button should revert to "Track"
    await expect(page.getByRole("button", { name: /^track$/i })).toBeVisible();
  });

  test("redirects unauthenticated user from /tracked to /login", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null })
    );
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: { local: true, oidc: null } })
    );

    await page.goto("/tracked");

    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Watchlist management", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
  });

  test("shows tracked titles on watchlist page", async ({ page }) => {
    await page.route("**/api/track", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          json: { titles: [MOCK_TRACKED_TITLE], count: 1 },
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/tracked");

    await expect(page.getByRole("heading", { name: /tracked titles/i })).toBeVisible();
    await expect(page.getByText("Test Movie")).toBeVisible();
  });

  test("shows tracked count in heading", async ({ page }) => {
    await page.route("**/api/track", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          json: { titles: [MOCK_TRACKED_TITLE], count: 1 },
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/tracked");

    await expect(page.getByText(/tracked titles \(1\)/i)).toBeVisible();
  });

  test("shows empty state when no titles are tracked", async ({ page }) => {
    await page.route("**/api/track", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { titles: [], count: 0 } });
      } else {
        route.continue();
      }
    });

    await page.goto("/tracked");

    await expect(page.getByText(/no tracked titles yet/i)).toBeVisible();
  });

  test("removes a title from the watchlist", async ({ page }) => {
    const titles = [MOCK_TRACKED_TITLE];
    await page.route("**/api/track", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { titles, count: titles.length } });
      } else {
        route.continue();
      }
    });
    await page.route("**/api/track/tt1234567", async (route) => {
      if (route.request().method() === "DELETE") {
        titles.splice(0, 1);
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });

    await page.goto("/tracked");
    await expect(page.getByText("Test Movie")).toBeVisible();

    // Click the "Tracked" button to untrack
    const trackedButton = page.getByRole("button", { name: /^tracked$/i });
    await trackedButton.click();

    // After untracking and refresh, the title should be gone
    await expect(page.getByText(/no tracked titles yet/i)).toBeVisible();
  });

  test("shows TV badge on show titles in watchlist", async ({ page }) => {
    const trackedShow = {
      ...MOCK_TRACKED_TITLE,
      id: "tt9876543",
      object_type: "SHOW",
      title: "Test Show",
    };
    await page.route("**/api/track", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: { titles: [trackedShow], count: 1 } });
      } else {
        route.continue();
      }
    });

    await page.goto("/tracked");

    await expect(page.getByText("TV")).toBeVisible();
  });
});
