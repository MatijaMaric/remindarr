import { test, expect } from "@playwright/test";
import { mockLoggedIn } from "./helpers";
import { SettingsAdminPage } from "./pages/settings-admin-page";

test.describe.configure({ mode: "serial" });

// Admin session — MOCK_SESSION does NOT have admin role; construct inline.
const MOCK_ADMIN_SESSION = {
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: "2099-01-01T00:00:00Z",
    token: "mock-session-token",
  },
  user: {
    id: "user-1",
    name: "Admin User",
    email: "admin@example.com",
    username: "admin",
    role: "admin",
    is_admin: true,
  },
};

async function mockAdminSession(page: SettingsAdminPage["page"]) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: MOCK_ADMIN_SESSION }),
  );
  await page.route("**/api/auth/custom/providers", (route) =>
    route.fulfill({ json: { local: true, oidc: null } }),
  );
}

const UNCONFIGURED_SETTINGS = {
  oidc: {
    issuer_url: { value: "", source: "unset" },
    client_id: { value: "", source: "unset" },
    client_secret: { value: "", source: "unset" },
    redirect_uri: { value: "", source: "unset" },
    admin_claim: { value: "", source: "unset" },
    admin_value: { value: "", source: "unset" },
  },
  oidc_configured: false,
};

async function mockAdminApis(page: SettingsAdminPage["page"]) {
  await page.route("**/api/jobs**", (route) =>
    route.fulfill({
      json: { crons: [], stats: {}, recentJobs: [] },
    }),
  );
  await page.route("**/api/admin/settings**", (route) =>
    route.fulfill({ json: UNCONFIGURED_SETTINGS }),
  );
  await page.route("**/api/admin/config**", (route) =>
    route.fulfill({ json: { safe: [], secrets: [] } }),
  );
  await page.route("**/api/admin/logs**", (route) =>
    route.fulfill({ json: { entries: [], count: 0 } }),
  );
}

// Background mocks required for all authenticated pages.
async function mockBackgroundApis(page: SettingsAdminPage["page"]) {
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

test.describe("Settings — admin tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Admin tab is accessible to admin users and shows all sections", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await mockAdminApis(page);

    await sap.gotoAdminTab();
    await sap.waitForVisible(sap.backgroundJobsSection());

    // All five sections
    await expect(sap.backgroundJobsSection()).toBeVisible();
    await expect(sap.oidcSection()).toBeVisible();
    await expect(sap.runtimeConfigSection()).toBeVisible();
    await expect(sap.serverLogsSection()).toBeVisible();
    await expect(sap.maintenanceSection()).toBeVisible();

    // "Manage users →" link
    await expect(sap.manageUsersLink()).toBeVisible();
  });

  test("TC-02: Non-admin user cannot access the admin tab — falls back to account tab", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);

    // Mock account tab API calls
    await page.route("**/api/user/profile**", (route) =>
      route.fulfill({ json: {} }),
    );

    // Mock account tab API calls so AccountTab loads cleanly
    await page.route("**/api/user/me/profile**", (route) =>
      route.fulfill({
        json: {
          id: "user-1",
          username: "testuser",
          name: "Test User",
          email: "test@example.com",
          display_name: null,
          bio: null,
          image: null,
        },
      }),
    );

    await sap.gotoAdminTab();
    await page.waitForURL("**/settings**", { waitUntil: "commit" });

    // tab=admin param stays in the URL but admin content is NOT rendered
    // (SettingsPage coerces activeTab to "account" without updating the URL param)
    await expect(page.getByText("Background jobs")).not.toBeVisible();
    await expect(page.getByText("OpenID Connect")).not.toBeVisible();
  });

  test("TC-03: OIDC 'Not configured' status pill shown when OIDC is unconfigured", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await mockAdminApis(page);

    await sap.gotoAdminTab();
    await sap.waitForVisible(sap.oidcSection());

    // Status pill
    await expect(page.getByText("Not configured").first()).toBeVisible();

    // All four main OIDC inputs rendered as editable fields
    await expect(
      page.getByPlaceholder("https://auth.example.com"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("my-client-id")).toBeVisible();

    // Save button visible and enabled
    await expect(sap.saveOidcButton()).toBeVisible();
    await expect(sap.saveOidcButton()).toBeEnabled();
  });

  test("TC-04: OIDC fields locked when values are set via environment variable", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);

    // Override admin/settings with env-sourced fields
    await page.route("**/api/jobs**", (route) =>
      route.fulfill({ json: { crons: [], stats: {}, recentJobs: [] } }),
    );
    await page.route("**/api/admin/settings**", (route) =>
      route.fulfill({
        json: {
          oidc: {
            issuer_url: { value: "https://auth.example.com", source: "env" },
            client_id: { value: "my-client-id", source: "env" },
            client_secret: { value: "***", source: "env" },
            redirect_uri: { value: "", source: "unset" },
            admin_claim: { value: "", source: "unset" },
            admin_value: { value: "", source: "unset" },
          },
          oidc_configured: true,
        },
      }),
    );
    await page.route("**/api/admin/config**", (route) =>
      route.fulfill({ json: { safe: [], secrets: [] } }),
    );
    await page.route("**/api/admin/logs**", (route) =>
      route.fulfill({ json: { entries: [], count: 0 } }),
    );

    await sap.gotoAdminTab();
    await sap.waitForVisible(sap.oidcSection());

    // "Configured" pill
    await expect(page.getByText("Configured").first()).toBeVisible();

    // ENV value displayed as static text
    await expect(
      page.getByText("https://auth.example.com").first(),
    ).toBeVisible();

    // "(set via environment variable)" label present for env fields
    await expect(
      page.getByText("(set via environment variable)").first(),
    ).toBeVisible();

    // Amber ENV badge visible
    await expect(page.getByText("ENV").first()).toBeVisible();

    // Redirect URI still an editable input (source "unset")
    await expect(page.getByPlaceholder(/localhost.*callback/i)).toBeVisible();
  });

  test("TC-05: Saving OIDC settings calls the API and shows success message", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await mockAdminApis(page);

    // Register PUT handler AFTER mockAdminApis (LIFO: last registered = first matched)
    await page.route("**/api/admin/settings**", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          json: { success: true, oidc_configured: true },
        });
      }
      return route.fulfill({ json: UNCONFIGURED_SETTINGS });
    });

    await sap.gotoAdminTab();
    await sap.waitForVisible(sap.oidcSection());

    // Fill in OIDC fields
    await page
      .getByPlaceholder("https://auth.example.com")
      .fill("https://sso.example.com");
    await page.getByPlaceholder("my-client-id").fill("test-client");

    await sap.saveOidcButton().click();

    await expect(
      page.getByText("OIDC configured successfully").first(),
    ).toBeVisible();
  });

  test("TC-06: Background jobs section shows 'No scheduled jobs configured.' empty state", async ({
    page,
  }) => {
    const sap = new SettingsAdminPage(page);
    await mockAdminSession(page);
    await mockBackgroundApis(page);
    await mockAdminApis(page);

    await sap.gotoAdminTab();
    await sap.waitForVisible(sap.backgroundJobsSection());

    await expect(page.getByText("No scheduled jobs configured.")).toBeVisible();
  });
});
