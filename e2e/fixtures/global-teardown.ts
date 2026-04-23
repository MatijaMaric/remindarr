import type { MockOidcServer } from "./mock-oidc";
import type { MockWebhookServer } from "./mock-webhook";

export default async function globalTeardown() {
  const storage = globalThis as unknown as {
    __e2eServers?: { oidcServer: MockOidcServer | null; webhookServer: MockWebhookServer | null };
  };
  const servers = storage.__e2eServers;
  if (!servers) return;
  await servers.oidcServer?.stop().catch(() => {});
  await servers.webhookServer?.stop().catch(() => {});
}
