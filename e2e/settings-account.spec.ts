import { test, expect } from "@playwright/test";
import { mockLoggedOut, mockLoggedIn, MOCK_SESSION } from "./helpers";
import { SettingsAccountPage } from "./pages/settings-account-page";

test.describe.configure({ mode: "serial" });

const MOCK_PROFILE = {
  display_name: "Test User",
  bio: null,
  country_code: "US",
  locale: null,
};

const MOCK_TRACK = {
  titles: [],
  count: 0,
  profile_public: true,
  profile_visibility: "public",
};

const MOCK_ACTIVITY_SETTINGS = { enabled: false, kind_visibility: {} };

async function setupSettingsMocks(page: SettingsAccountPage["page"]) {
  // Background shell components (AchievementToast, BottomTabBar) fire these
  // immediately after auth resolves. Without mocks they return 401 from the
  // real server, which dispatches auth:unauthorized and logs the user out.
  await page.route("**/api/achievements/me**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/recommendations/count**", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/user/settings/subscriptions**", (route) =>
    route.fulfill({ json: { providerIds: [] } }),
  );
  // Settings account tab endpoints
  await page.route("**/api/user/me/profile", (route) =>
    route.fulfill({ json: MOCK_PROFILE }),
  );
  await page.route("**/api/track", (route) =>
    route.fulfill({ json: MOCK_TRACK }),
  );
  await page.route("**/api/user/me/activity-settings", (route) =>
    route.fulfill({ json: MOCK_ACTIVITY_SETTINGS }),
  );
}

test.describe("Settings — Account tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Account tab loads with user identity card", async ({ page }) => {
    const sap = new SettingsAccountPage(page);
    await setupSettingsMocks(page);
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    // Page heading visible
    await expect(sap.heading()).toBeVisible();

    // Username field readable (read-only input)
    await expect(page.locator('input[value="testuser"]').first()).toBeVisible();

    // Auth provider field
    await expect(page.locator('input[value="local"]').first()).toBeVisible();

    // Role field
    await expect(page.locator('input[value="user"]').first()).toBeVisible();

    // Breadcrumb — the amber-highlighted tab name in the breadcrumb area
    await expect(page.getByText("/settings")).toBeVisible();
    await expect(page.getByText("Account").first()).toBeVisible();
  });

  test("TC-02: Unauthenticated user redirected to /login", async ({ page }) => {
    const sap = new SettingsAccountPage(page);
    await mockLoggedOut(page);
    await sap.gotoSettings();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(
      page.getByRole("heading", { name: /settings/i }),
    ).not.toBeVisible();
  });

  test("TC-03: Profile edit form saves display name", async ({ page }) => {
    const sap = new SettingsAccountPage(page);
    let patchBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/me/profile", async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { ...MOCK_PROFILE, display_name: "Updated Name" },
        });
      } else {
        await route.fulfill({ json: MOCK_PROFILE });
      }
    });
    await page.route("**/api/track", (route) =>
      route.fulfill({ json: MOCK_TRACK }),
    );
    await page.route("**/api/user/me/activity-settings", (route) =>
      route.fulfill({ json: MOCK_ACTIVITY_SETTINGS }),
    );
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    // Find the Display name input in the Edit profile card (the editable one,
    // not the read-only one in the User identity card above it).
    // Both sections label their input "Display name"; the editable one is second.
    const displayNameInput = page.getByLabel(/display name/i).nth(1);
    await displayNameInput.clear();
    await displayNameInput.fill("Updated Name");

    // Click the Save button in the Edit profile card form
    await page
      .getByRole("button", { name: /^save$/i })
      .first()
      .click();

    // Wait for success message
    await expect(page.getByText(/profile saved/i)).toBeVisible({
      timeout: 5000,
    });
    expect(patchBody).toContain("Updated Name");
  });

  test("TC-04: Password change form shown for local auth users", async ({
    page,
  }) => {
    const sap = new SettingsAccountPage(page);
    await setupSettingsMocks(page);
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    // SCard renders title as a div, not a heading element
    await expect(page.getByText(/change password/i).first()).toBeVisible();
    await expect(page.getByLabel(/current password/i).first()).toBeVisible();
    await expect(page.getByLabel(/new password/i).first()).toBeVisible();
  });

  test("TC-05: Password change form inputs are interactive for local users", async ({
    page,
  }) => {
    // Note: AuthContext.mapSessionToUser always sets auth_provider:"local"
    // regardless of the session payload, so all mock-session tests see
    // the password form. This test verifies the form inputs are editable.
    const sap = new SettingsAccountPage(page);
    await setupSettingsMocks(page);
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    const currentPwInput = page.getByLabel(/current password/i).first();
    const newPwInput = page.getByLabel(/new password/i).first();

    await expect(currentPwInput).toBeVisible();
    await expect(newPwInput).toBeVisible();
    await expect(currentPwInput).toBeEditable();
    await expect(newPwInput).toBeEditable();
  });

  test("TC-06: Profile visibility selector renders and updates", async ({
    page,
  }) => {
    const sap = new SettingsAccountPage(page);
    let patchBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/me/profile", (route) =>
      route.fulfill({ json: MOCK_PROFILE }),
    );
    await page.route("**/api/track", async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { ...MOCK_TRACK, profile_visibility: "private" },
        });
      } else {
        await route.fulfill({ json: MOCK_TRACK });
      }
    });
    await page.route("**/api/user/me/activity-settings", (route) =>
      route.fulfill({ json: MOCK_ACTIVITY_SETTINGS }),
    );
    // visibility PATCH endpoint
    await page.route("**/api/track/profile-visibility", async (route) => {
      patchBody = route.request().postData() ?? "";
      await route.fulfill({ json: { profile_visibility: "private" } });
    });
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.visibilitySelector());

    // Click the "Private" radio card (i18n renders as "Private")
    await page
      .getByRole("button", { name: /^private/i })
      .first()
      .click();
    await page.waitForTimeout(500);

    expect(patchBody).toContain("private");
  });

  test("TC-07: Activity stream toggle fires PATCH", async ({ page }) => {
    const sap = new SettingsAccountPage(page);
    let patchBody = "";
    await page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await page.route("**/api/user/me/profile", (route) =>
      route.fulfill({ json: MOCK_PROFILE }),
    );
    await page.route("**/api/track", (route) =>
      route.fulfill({ json: MOCK_TRACK }),
    );
    await page.route("**/api/user/me/activity-settings", async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = route.request().postData() ?? "";
        await route.fulfill({
          json: { enabled: true, kind_visibility: {} },
        });
      } else {
        await route.fulfill({ json: MOCK_ACTIVITY_SETTINGS });
      }
    });
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    // Click the switch control for "Show activity on profile"
    const toggle = page.getByRole("switch", {
      name: /show activity on profile/i,
    });
    await sap.waitForVisible(toggle);
    await toggle.click();
    await page.waitForTimeout(500);

    expect(patchBody).toContain("true");
  });

  test("TC-08: Social / Invite link navigates to /invite", async ({ page }) => {
    const sap = new SettingsAccountPage(page);
    await setupSettingsMocks(page);
    await mockLoggedIn(page);
    await sap.gotoSettings();
    await sap.waitForVisible(sap.heading());

    await sap.inviteLink().click();
    await page.waitForURL("**/invite**", { waitUntil: "commit" });

    expect(page.url()).toContain("/invite");
  });
});
