import { test, expect } from "@playwright/test";
import { mockLoggedIn, mockLoggedOut } from "./helpers";
import { SettingsIntegrationsPage } from "./pages/settings-integrations-page";

test.describe.configure({ mode: "serial" });

const PLEX_INTEGRATION = {
  id: "integ-1",
  user_id: "user-1",
  provider: "plex",
  name: "My Plex Server",
  config: {
    serverUrl: "http://192.168.1.10:32400",
    serverId: "abc123",
    serverName: "My Plex Server",
    plexUsername: "plexuser",
    syncMovies: true,
    syncEpisodes: true,
  },
  enabled: true,
  last_sync_at: "2024-03-01T12:00:00Z",
  last_sync_error: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-03-01T12:00:00Z",
};

// Mock all token endpoints that IntegrationsTab sections query.
async function mockTokenApis(page: SettingsIntegrationsPage["page"]) {
  await page.route("**/api/feed/token**", (route) =>
    route.fulfill({ json: { token: null } }),
  );
  await page.route("**/api/kiosk/token**", (route) =>
    route.fulfill({ json: { token: null } }),
  );
  await page.route("**/api/share/token**", (route) =>
    route.fulfill({ json: { token: null } }),
  );
}

// Background mocks required for all authenticated pages.
async function mockBackgroundApis(page: SettingsIntegrationsPage["page"]) {
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

test.describe("Settings — integrations tab", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Running on chromium only",
  );

  test("TC-01: Integrations tab loads and shows Plex section", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    await mockTokenApis(page);
    await page.route("**/api/integrations**", (route) =>
      route.fulfill({ json: { integrations: [] } }),
    );

    await sip.gotoIntegrationsTab();
    await sip.waitForVisible(sip.plexSection());

    // Plex section is visible
    await expect(sip.plexSection()).toBeVisible();
    await expect(
      page.getByText(
        "Connect your Plex server to automatically sync your watched history.",
      ),
    ).toBeVisible();

    // Connect Plex button shown (no existing integration)
    await expect(sip.connectPlexButton()).toBeVisible();
  });

  test("TC-02: Unauthenticated user is redirected to /login", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedOut(page);

    await sip.gotoIntegrationsTab();
    await page.waitForURL("**/login**", { waitUntil: "commit" });

    expect(page.url()).toContain("/login");
    await expect(page.getByText("Plex")).not.toBeVisible();
  });

  test("TC-03: Connect Plex button is visible when no integration exists", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    await mockTokenApis(page);
    await page.route("**/api/integrations**", (route) =>
      route.fulfill({ json: { integrations: [] } }),
    );

    await sip.gotoIntegrationsTab();
    await sip.waitForVisible(sip.plexSection());

    // Connect Plex button present
    await expect(sip.connectPlexButton()).toBeVisible();
    // No Disconnect button
    await expect(sip.disconnectButton()).not.toBeVisible();
  });

  test("TC-04: Clicking 'Connect Plex' opens the PIN-waiting state", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    await mockTokenApis(page);
    await page.route("**/api/integrations**", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          json: {
            pinId: 42,
            authUrl: "https://app.plex.tv/auth#?clientID=mock&code=mock-pin",
          },
        });
      }
      return route.fulfill({ json: { integrations: [] } });
    });

    // Suppress any popup that opens
    page.on("popup", (popup) => void popup.close());

    await sip.gotoIntegrationsTab();
    await sip.waitForVisible(sip.connectPlexButton());

    await sip.connectPlexButton().click();

    // Waiting state is shown
    await expect(
      page.getByText(/waiting for authorization/i).first(),
    ).toBeVisible();
    await expect(sip.cancelConnectButton()).toBeVisible();
    await expect(sip.openAuthLink()).toBeVisible();

    // Connect button is gone
    await expect(sip.connectPlexButton()).not.toBeVisible();
  });

  test("TC-05: Plex already connected — shows server card with controls", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    await mockTokenApis(page);
    await page.route("**/api/integrations**", (route) =>
      route.fulfill({ json: { integrations: [PLEX_INTEGRATION] } }),
    );

    await sip.gotoIntegrationsTab();
    await sip.waitForVisible(page.getByText("My Plex Server").first());

    // Server name and URL visible
    await expect(page.getByText("My Plex Server").first()).toBeVisible();
    await expect(
      page.getByText("http://192.168.1.10:32400").first(),
    ).toBeVisible();

    // Status pill
    await expect(page.getByText("Enabled").first()).toBeVisible();

    // Action buttons visible
    await expect(sip.disconnectButton()).toBeVisible();
    await expect(sip.syncNowButton()).toBeVisible();
    await expect(sip.disableButton()).toBeVisible();

    // The "Connect Plex" button is always visible in idle step so users can
    // add additional servers; it is not hidden by existing integrations.
  });

  test("TC-06: Disconnecting Plex removes the integration card", async ({
    page,
  }) => {
    const sip = new SettingsIntegrationsPage(page);
    await mockLoggedIn(page);
    await mockBackgroundApis(page);
    await mockTokenApis(page);

    let disconnected = false;

    await page.route("**/api/integrations**", (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === "DELETE" && url.includes("/integ-1")) {
        disconnected = true;
        return route.fulfill({ json: {} });
      }

      return route.fulfill({
        json: {
          integrations: disconnected ? [] : [PLEX_INTEGRATION],
        },
      });
    });

    await sip.gotoIntegrationsTab();
    await sip.waitForVisible(sip.disconnectButton());

    await sip.disconnectButton().click();

    // Success message
    await expect(
      page.getByText("Plex integration disconnected.").first(),
    ).toBeVisible();

    // Integration card is gone; Connect Plex button reappears
    await expect(page.getByText("My Plex Server")).not.toBeVisible();
    await expect(sip.connectPlexButton()).toBeVisible();
  });
});
