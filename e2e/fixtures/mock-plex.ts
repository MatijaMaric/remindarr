/**
 * Playwright route-mock helpers for Plex integration e2e tests.
 *
 * Intercepts /api/integrations/* so specs run without a real Plex account.
 * The Plex PIN OAuth flow is a three-step: create pin → user visits app.plex.tv
 * → server polls until token resolves. This mock wires the PIN directly to a
 * resolved token so tests don't need to visit external URLs.
 */
import type { Page } from "@playwright/test";

export const MOCK_PLEX_PIN = {
  pinId: 99991,
  authUrl: "https://app.plex.tv/auth#?code=mock-pin-code&clientID=mock-client",
};

export const MOCK_PLEX_SERVER = {
  name: "My Plex Server",
  clientIdentifier: "mock-server-id-abc123",
  connections: [
    { uri: "http://192.168.1.100:32400", local: true, relay: false },
  ],
};

export const MOCK_INTEGRATION = {
  id: "integ-1",
  provider: "plex",
  name: "My Plex Server",
  enabled: true,
  last_sync_at: null,
  last_sync_error: null,
  config: {
    serverUrl: "http://192.168.1.100:32400",
    serverId: "mock-server-id-abc123",
    serverName: "My Plex Server",
    plexUsername: "plexuser",
    syncMovies: true,
    syncEpisodes: true,
  },
};

/**
 * Sets up route mocks for the Plex integration API.
 *
 * Mock flow:
 * 1. POST /api/integrations/plex/pin → returns a PIN + auth URL (never visit)
 * 2. POST /api/integrations/plex/pin/:id → returns resolved token + server list
 * 3. POST /api/integrations → 201 with the saved integration
 * 4. GET /api/integrations → lists saved integrations
 */
export async function mockPlexEndpoints(
  page: Page,
  overrides: { integrations?: (typeof MOCK_INTEGRATION)[] } = {},
) {
  const integrations = overrides.integrations ?? [];

  // PIN poll — always returns resolved so tests don't need to wait
  await page.route("**/api/integrations/plex/pin/**", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          resolved: true,
          authToken: "mock-plex-token",
          servers: [MOCK_PLEX_SERVER],
        },
      },
    }),
  );

  // PIN creation
  await page.route("**/api/integrations/plex/pin", (route) =>
    route.fulfill({
      json: { ok: true, data: MOCK_PLEX_PIN },
    }),
  );

  // Save integration (POST /)
  await page.route("**/api/integrations", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        json: { integration: MOCK_INTEGRATION },
      });
    }
    return route.fulfill({ json: { integrations } });
  });

  // Sync trigger
  await page.route("**/api/integrations/*/sync", (route) =>
    route.fulfill({ json: { ok: true, data: { success: true } } }),
  );

  // Status
  await page.route("**/api/integrations/*/status", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { last_sync_at: null, last_sync_error: null, enabled: true },
      },
    }),
  );
}
