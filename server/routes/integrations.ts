import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  createIntegration,
  updateIntegration,
  deleteIntegration,
  getIntegrationsByUser,
  getIntegrationById,
} from "../db/repository";
import { createPin, checkPin, buildPlexAuthUrl, getServers } from "../plex/client";
import { syncPlexWatched } from "../plex/sync";
import { ok, err } from "./response";
import Sentry from "../sentry";

const app = new Hono<AppEnv>();

// GET / — list user's integrations (strip token from response)
app.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await getIntegrationsByUser(user.id);
  const integrations = rows.map(sanitize);
  return ok(c, { integrations });
});

// POST /plex/pin — start Plex OAuth PIN flow
app.post("/plex/pin", async (c) => {
  try {
    const pin = await createPin();
    const authUrl = buildPlexAuthUrl(pin.code);
    return ok(c, { pinId: pin.id, authUrl });
  } catch (e) {
    Sentry.captureException(e);
    return err(c, "Failed to create Plex PIN", 500);
  }
});

// POST /plex/pin/:pinId — poll PIN; if resolved returns server list
app.post("/plex/pin/:pinId", async (c) => {
  const pinId = parseInt(c.req.param("pinId"), 10);
  if (isNaN(pinId)) return err(c, "Invalid pin ID");

  let pin;
  try {
    pin = await checkPin(pinId);
  } catch (e) {
    Sentry.captureException(e);
    return err(c, "Failed to check Plex PIN", 500);
  }

  if (!pin.authToken) {
    return ok(c, { resolved: false });
  }

  let servers;
  try {
    servers = await getServers(pin.authToken);
  } catch (e) {
    Sentry.captureException(e);
    return err(c, "Failed to fetch Plex servers", 500);
  }

  return ok(c, {
    resolved: true,
    authToken: pin.authToken,
    servers: servers.map((s) => ({
      name: s.name,
      clientIdentifier: s.clientIdentifier,
      connections: s.connections,
    })),
  });
});

// POST /plex/servers — refresh server list with an existing token
app.post("/plex/servers", async (c) => {
  const body = await c.req.json();
  const { authToken } = body;
  if (!authToken) return err(c, "authToken is required");

  try {
    const servers = await getServers(authToken);
    return ok(c, {
      servers: servers.map((s) => ({
        name: s.name,
        clientIdentifier: s.clientIdentifier,
        connections: s.connections,
      })),
    });
  } catch (e) {
    Sentry.captureException(e);
    return err(c, "Failed to fetch Plex servers", 500);
  }
});

// POST / — save a new integration
app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();

  const { provider, name, config } = body;
  if (!provider || !config) return err(c, "provider and config are required");
  if (provider !== "plex") return err(c, `Unknown provider: ${provider}`);

  const { plexToken, serverUrl, serverId, serverName, plexUsername } = config;
  if (!plexToken || !serverUrl || !serverId || !serverName) {
    return err(c, "Plex config requires: plexToken, serverUrl, serverId, serverName");
  }

  const integrationName = name || serverName;
  const integrationConfig = {
    plexToken,
    serverUrl: serverUrl.replace(/\/$/, ""),
    serverId,
    serverName,
    plexUsername: plexUsername ?? "",
    syncMovies: config.syncMovies !== false,
    syncEpisodes: config.syncEpisodes !== false,
  };

  const id = await createIntegration(user.id, provider, integrationName, integrationConfig);
  const integration = await getIntegrationById(id, user.id);
  return c.json({ integration: sanitize(integration!) }, 201);
});

// PUT /:id — update integration
app.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await getIntegrationById(id, user.id);
  if (!existing) return err(c, "Integration not found", 404);

  const updates: Parameters<typeof updateIntegration>[2] = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
  if (body.config !== undefined) {
    updates.config = {
      ...existing.config,
      ...body.config,
      serverUrl: (body.config.serverUrl ?? existing.config.serverUrl).replace(/\/$/, ""),
    } as any;
  }

  await updateIntegration(id, user.id, updates);
  const integration = await getIntegrationById(id, user.id);
  return ok(c, { integration: sanitize(integration!) });
});

// DELETE /:id — delete integration
app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const existing = await getIntegrationById(id, user.id);
  if (!existing) return err(c, "Integration not found", 404);

  await deleteIntegration(id, user.id);
  return ok(c, {});
});

// POST /:id/sync — trigger manual Plex sync
app.post("/:id/sync", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const integration = await getIntegrationById(id, user.id);
  if (!integration) return err(c, "Integration not found", 404);
  if (integration.provider !== "plex") return err(c, "Only Plex integrations support manual sync");

  try {
    const result = await syncPlexWatched({ id, user_id: user.id, config: integration.config as any });
    return ok(c, { success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return ok(c, { success: false, error: message });
  }
});

// GET /:id/status — get last sync status
app.get("/:id/status", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const integration = await getIntegrationById(id, user.id);
  if (!integration) return err(c, "Integration not found", 404);

  return ok(c, {
    last_sync_at: integration.last_sync_at,
    last_sync_error: integration.last_sync_error,
    enabled: integration.enabled,
  });
});

function sanitize(row: Awaited<ReturnType<typeof getIntegrationById>>) {
  if (!row) return row;
  // Strip the Plex token from API responses
  const { config, ...rest } = row;
  const safeConfig = { ...config };
  if ("plexToken" in safeConfig) {
    (safeConfig as any).plexToken = undefined;
    delete (safeConfig as any).plexToken;
  }
  return { ...rest, config: safeConfig };
}

export default app;
