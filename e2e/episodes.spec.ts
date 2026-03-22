import { test, expect } from "@playwright/test";
import {
  MOCK_EPISODE,
  MOCK_UPCOMING_EPISODE,
  mockLoggedIn,
} from "./helpers";

test.describe("Mark episodes as watched", () => {
  test.beforeEach(async ({ page }) => {
    await mockLoggedIn(page);
  });

  test("shows today's episodes on upcoming page", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [MOCK_EPISODE], upcoming: [], unwatched: [] },
      })
    );

    await page.goto("/upcoming");

    await expect(page.getByRole("heading", { name: /today/i })).toBeVisible();
    await expect(page.getByText("Test Show")).toBeVisible();
  });

  test("shows upcoming episodes section", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [], upcoming: [MOCK_UPCOMING_EPISODE], unwatched: [] },
      })
    );

    await page.goto("/upcoming");

    await expect(page.getByRole("heading", { name: /coming up/i })).toBeVisible();
    await expect(page.getByText("Test Show")).toBeVisible();
  });

  test("shows empty state when no episodes are airing", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [], upcoming: [], unwatched: [] },
      })
    );

    await page.goto("/upcoming");

    await expect(
      page.getByText(/no upcoming episodes for your tracked shows/i)
    ).toBeVisible();
  });

  test("marks episode as watched on upcoming page", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: {
          today: [{ ...MOCK_EPISODE, is_watched: false }],
          upcoming: [],
          unwatched: [],
        },
      })
    );
    await page.route("**/api/watched/101", (route) =>
      route.fulfill({ json: { success: true } })
    );

    await page.goto("/upcoming");
    await expect(page.getByTitle(/mark as watched/i)).toBeVisible();

    const watchRequest = page.waitForRequest(
      (req) => req.url().includes("/api/watched/101") && req.method() === "POST"
    );
    await page.getByTitle(/mark as watched/i).click();
    await watchRequest;
  });

  test("marks episode as unwatched when clicking the watched icon", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: {
          today: [{ ...MOCK_EPISODE, is_watched: true }],
          upcoming: [],
          unwatched: [],
        },
      })
    );
    await page.route("**/api/watched/101", (route) =>
      route.fulfill({ json: { success: true } })
    );

    await page.goto("/upcoming");
    await expect(page.getByTitle(/mark as unwatched/i)).toBeVisible();

    const unwatchRequest = page.waitForRequest(
      (req) => req.url().includes("/api/watched/101") && req.method() === "DELETE"
    );
    await page.getByTitle(/mark as unwatched/i).click();
    await unwatchRequest;
  });

  test("redirects unauthenticated user from /upcoming to /login", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null })
    );
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: { local: true, oidc: null } })
    );

    await page.goto("/upcoming");

    await expect(page).toHaveURL(/\/login/);
  });

  test("shows unwatched episodes carousel on home page", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: {
          today: [],
          upcoming: [],
          unwatched: [MOCK_EPISODE],
        },
      })
    );

    await page.goto("/");

    await expect(page.getByText("Test Show")).toBeVisible();
    await expect(page.getByText(/S01E01/i)).toBeVisible();
  });

  test("bulk marks season as watched from home page", async ({ page }) => {
    const episode1 = { ...MOCK_EPISODE, id: 101, episode_number: 1, name: "Pilot" };
    const episode2 = { ...MOCK_EPISODE, id: 102, episode_number: 2, name: "Episode 2" };
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [], upcoming: [], unwatched: [episode1, episode2] },
      })
    );
    await page.route("**/api/watched/bulk", (route) =>
      route.fulfill({ json: { success: true } })
    );

    await page.goto("/");
    await expect(page.getByRole("button", { name: /mark season watched/i })).toBeVisible();

    const bulkRequest = page.waitForRequest(
      (req) => req.url().includes("/api/watched/bulk") && req.method() === "POST"
    );
    await page.getByRole("button", { name: /mark season watched/i }).click();
    await bulkRequest;
  });

  test("episode code format is correct (S01E01)", async ({ page }) => {
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({
        json: { today: [MOCK_EPISODE], upcoming: [], unwatched: [] },
      })
    );

    await page.goto("/upcoming");

    await expect(page.getByText("S01E01")).toBeVisible();
  });
});
