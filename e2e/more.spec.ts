import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn } from "./helpers";
import { MorePagePO } from "./pages/more-page";

test.describe.configure({ mode: "serial" });

async function setupMoreMocks(page: MorePagePO["page"]) {
  // Background shell components — must mock to prevent auth:unauthorized.
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [], onlyMine: false } }),
  );
}

test.describe("More page", () => {
  // MorePage redirects to /reels on desktop; use mobile viewport throughout.
  test.use({ viewport: { width: 390, height: 844 } });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Page loads with profile card, Discover, Account, and Session groups", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);
    await mp.gotoMore();
    await mp.waitForVisible(mp.profileCard());

    // Profile card: avatar initial "T", display name, @username
    await expect(page.getByText("T").first()).toBeVisible();
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("@testuser")).toBeVisible();

    // Discover group
    await expect(
      page.getByText("Discover", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /discovery/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Recommendations and suggestions for you"),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /stats/i }).first(),
    ).toBeVisible();
    await expect(page.getByText("Your watch history")).toBeVisible();

    // Account group
    await expect(page.getByText("Account").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /profile/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /settings/i }).first(),
    ).toBeVisible();

    // Session group with sign out button (red/danger)
    await expect(page.getByText("Session").first()).toBeVisible();
    await expect(mp.signOutButton()).toBeVisible();
  });

  test("TC-02: Unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await mockLoggedOut(page);
    await mp.gotoMore();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(mp.signOutButton()).not.toBeVisible();
  });

  test("TC-03: Profile card navigates to the user's profile page", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);
    await mp.gotoMore();
    await mp.waitForVisible(mp.profileCard());

    await mp.profileCard().click();
    await page.waitForURL("**/user/testuser**", { waitUntil: "commit" });
    expect(page.url()).toContain("/user/testuser");
  });

  test("TC-04: 'Discovery' row navigates to /discovery", async ({ page }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);
    await mp.gotoMore();
    await mp.waitForVisible(mp.profileCard());

    await page
      .getByRole("link", { name: /discovery/i })
      .first()
      .click();
    await page.waitForURL("**/discovery**", { waitUntil: "commit" });
    expect(page.url()).toContain("/discovery");
  });

  test("TC-05: 'Stats' row navigates to /tracked?view=stats", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);
    await mp.gotoMore();
    await mp.waitForVisible(mp.profileCard());

    await page.getByRole("link", { name: /stats/i }).first().click();
    await page.waitForURL("**/tracked**", { waitUntil: "commit" });
    expect(page.url()).toContain("/tracked");
    expect(page.url()).toContain("view=stats");
  });

  test("TC-06: 'Settings' row navigates to /settings", async ({ page }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);
    await mp.gotoMore();
    await mp.waitForVisible(mp.profileCard());

    await page
      .getByRole("link", { name: /^settings$/i })
      .first()
      .click();
    await page.waitForURL("**/settings**", { waitUntil: "commit" });
    expect(page.url()).toContain("/settings");
  });

  test("TC-07: 'Sign out' button logs out and redirects to /login", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);
    await mockLoggedIn(page);

    await mp.gotoMore();
    await mp.waitForVisible(mp.signOutButton());

    let signOutCalled = 0;
    await page.route("**/api/auth/**sign-out**", async (route) => {
      signOutCalled++;
      // After sign-out, override get-session to return null
      await page.route("**/api/auth/get-session**", (r) =>
        r.fulfill({ json: null }),
      );
      return route.fulfill({ json: { success: true } });
    });

    await mp.signOutButton().click();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(signOutCalled).toBe(1);
    expect(page.url()).toContain("/login");
  });

  test("TC-08: Page shows display_name and derived initials when set", async ({
    page,
  }) => {
    const mp = new MorePagePO(page);
    await setupMoreMocks(page);

    // Custom session with display_name
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        json: {
          session: {
            id: "s1",
            userId: "u1",
            expiresAt: "2099-01-01T00:00:00Z",
            token: "tok",
          },
          user: {
            id: "u1",
            name: "Alice Smith",
            email: "alice@example.com",
            username: "alice",
            display_name: "Alice Smith",
            role: "user",
          },
        },
      }),
    );
    await page.route("**/api/auth/custom/providers", (route) =>
      route.fulfill({ json: { local: true, oidc: null } }),
    );

    await mp.gotoMore();
    // Wait for profile card with alice's name
    await mp.waitForVisible(page.getByText("Alice Smith").first());

    // Display name shown as primary label
    await expect(page.getByText("Alice Smith").first()).toBeVisible();

    // Initials derived from "Alice Smith" → "AS"
    await expect(page.getByText("AS")).toBeVisible();

    // Username shown in monospace
    await expect(page.getByText("@alice")).toBeVisible();
  });
});
