import { test, expect } from "@playwright/test";
import {
  MOCK_SESSION,
  MOCK_USER,
  MOCK_PROVIDERS,
  MOCK_OIDC_PROVIDERS,
  mockLoggedOut,
  mockLoggedIn,
  mockTitleEndpoints,
  mockBrowseEndpoints,
} from "./helpers";

test.describe("Login flow", () => {
  test("shows login form when not authenticated", async ({ page }) => {
    await mockLoggedOut(page);

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /sign in to remindarr/i })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("redirects authenticated user away from login page", async ({ page }) => {
    await mockLoggedIn(page);
    await mockTitleEndpoints(page);
    await mockBrowseEndpoints(page);
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({ json: { today: [], upcoming: [], unwatched: [] } })
    );

    await page.goto("/login");

    // Should redirect away from /login since user is logged in
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("logs in with valid credentials and redirects to home", async ({ page }) => {
    let sessionRequests = 0;
    await page.route("**/api/auth/get-session", (route) => {
      // First request (on app load): not logged in
      // Subsequent requests (after sign-in): logged in
      if (sessionRequests === 0) {
        sessionRequests++;
        route.fulfill({ json: null });
      } else {
        route.fulfill({ json: MOCK_SESSION });
      }
    });
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: MOCK_PROVIDERS })
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ json: { csrfToken: "mock-csrf-token" } })
    );
    await page.route("**/api/auth/sign-in/username", (route) =>
      route.fulfill({
        json: { token: "mock-token", user: MOCK_USER },
      })
    );
    await mockTitleEndpoints(page);
    await mockBrowseEndpoints(page);
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({ json: { today: [], upcoming: [], unwatched: [] } })
    );

    await page.goto("/login");
    await expect(page.getByLabel("Username")).toBeVisible();

    await page.getByLabel("Username").fill("testuser");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should navigate away from login page
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await mockLoggedOut(page);
    await page.route("**/api/auth/sign-in/username", (route) =>
      route.fulfill({
        json: { error: { message: "Invalid username or password" } },
      })
    );

    await page.goto("/login");
    await page.getByLabel("Username").fill("wronguser");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid username or password/i)
    ).toBeVisible();
  });

  test("shows OIDC sign-in button when OIDC is configured", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null })
    );
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: MOCK_OIDC_PROVIDERS })
    );

    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /sign in with pocketid/i })
    ).toBeVisible();
    // Local login should be hidden behind toggle
    await expect(page.getByLabel("Username")).not.toBeVisible();
  });

  test("reveals local login form when 'sign in with username' is clicked", async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ json: null })
    );
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: MOCK_OIDC_PROVIDERS })
    );

    await page.goto("/login");
    await page.getByRole("button", { name: /sign in with username instead/i }).click();

    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("logs out user when logout button is clicked", async ({ page }) => {
    await mockLoggedIn(page);
    await mockTitleEndpoints(page);
    await mockBrowseEndpoints(page);
    await page.route("**/api/episodes/upcoming", (route) =>
      route.fulfill({ json: { today: [], upcoming: [], unwatched: [] } })
    );
    await page.route("**/api/auth/sign-out", (route) =>
      route.fulfill({ json: { success: true } })
    );

    await page.goto("/");
    // Wait for the nav to show the user name
    await expect(page.getByText(MOCK_USER.name)).toBeVisible();

    await page.getByRole("button", { name: /logout/i }).click();

    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });
});
