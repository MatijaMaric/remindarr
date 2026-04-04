import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../schema";
import { integrations } from "../schema";
import { logger } from "../../logger";
import { traceDbQuery } from "../../tracing";

const log = logger.child({ module: "repository" });

export type PlexConfig = {
  plexToken: string;
  serverUrl: string;
  serverId: string;
  serverName: string;
  plexUsername: string;
  syncMovies: boolean;
  syncEpisodes: boolean;
};

export type IntegrationConfig = PlexConfig;

export async function createIntegration(
  userId: string,
  provider: string,
  name: string,
  config: IntegrationConfig
): Promise<string> {
  return traceDbQuery("createIntegration", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(integrations)
      .values({
        id,
        userId,
        provider,
        name,
        config: JSON.stringify(config),
      })
      .run();
    return id;
  });
}

export async function updateIntegration(
  id: string,
  userId: string,
  updates: {
    name?: string;
    config?: IntegrationConfig;
    enabled?: boolean;
  }
) {
  return traceDbQuery("updateIntegration", async () => {
    const db = getDb();
    const set: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.config !== undefined) set.config = JSON.stringify(updates.config);
    if (updates.enabled !== undefined) set.enabled = updates.enabled ? 1 : 0;

    await db.update(integrations)
      .set(set)
      .where(and(eq(integrations.id, id), eq(integrations.userId, userId)))
      .run();
  });
}

export async function deleteIntegration(id: string, userId: string) {
  return traceDbQuery("deleteIntegration", async () => {
    const db = getDb();
    await db.delete(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.userId, userId)))
      .run();
  });
}

function parseConfig(raw: string, id: string): IntegrationConfig {
  try {
    return JSON.parse(raw) as IntegrationConfig;
  } catch {
    log.warn("Failed to parse integration config", { id });
    return {} as IntegrationConfig;
  }
}

export async function getIntegrationsByUser(userId: string) {
  return traceDbQuery("getIntegrationsByUser", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: integrations.id,
        user_id: integrations.userId,
        provider: integrations.provider,
        name: integrations.name,
        config: integrations.config,
        enabled: integrations.enabled,
        last_sync_at: integrations.lastSyncAt,
        last_sync_error: integrations.lastSyncError,
        created_at: integrations.createdAt,
        updated_at: integrations.updatedAt,
      })
      .from(integrations)
      .where(eq(integrations.userId, userId))
      .all();

    return rows.map((row) => ({
      ...row,
      config: parseConfig(row.config, row.id),
      enabled: Boolean(row.enabled),
    }));
  });
}

export async function getIntegrationById(id: string, userId: string) {
  return traceDbQuery("getIntegrationById", async () => {
    const db = getDb();
    const row = await db
      .select({
        id: integrations.id,
        user_id: integrations.userId,
        provider: integrations.provider,
        name: integrations.name,
        config: integrations.config,
        enabled: integrations.enabled,
        last_sync_at: integrations.lastSyncAt,
        last_sync_error: integrations.lastSyncError,
        created_at: integrations.createdAt,
        updated_at: integrations.updatedAt,
      })
      .from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.userId, userId)))
      .get();

    if (!row) return null;
    return {
      ...row,
      config: parseConfig(row.config, row.id),
      enabled: Boolean(row.enabled),
    };
  });
}

export async function getEnabledIntegrationsByProvider(provider: string) {
  return traceDbQuery("getEnabledIntegrationsByProvider", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: integrations.id,
        user_id: integrations.userId,
        provider: integrations.provider,
        name: integrations.name,
        config: integrations.config,
        enabled: integrations.enabled,
        last_sync_at: integrations.lastSyncAt,
        last_sync_error: integrations.lastSyncError,
      })
      .from(integrations)
      .where(and(eq(integrations.provider, provider), eq(integrations.enabled, 1)))
      .all();

    return rows.map((row) => ({
      ...row,
      config: parseConfig(row.config, row.id),
      enabled: Boolean(row.enabled),
    }));
  });
}

export async function updateIntegrationSyncStatus(
  id: string,
  lastSyncAt: string | null,
  lastSyncError: string | null
) {
  return traceDbQuery("updateIntegrationSyncStatus", async () => {
    const db = getDb();
    await db.update(integrations)
      .set({
        lastSyncAt,
        lastSyncError,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(integrations.id, id))
      .run();
  });
}

export async function disableIntegration(id: string) {
  return traceDbQuery("disableIntegration", async () => {
    const db = getDb();
    await db.update(integrations)
      .set({ enabled: 0, updatedAt: sql`datetime('now')` })
      .where(eq(integrations.id, id))
      .run();
  });
}
