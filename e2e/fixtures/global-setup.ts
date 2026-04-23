import fs from "node:fs";
import path from "node:path";
import { startMockOidcServer, type MockOidcServer } from "./mock-oidc";
import { startMockWebhookServer, type MockWebhookServer } from "./mock-webhook";
import {
  E2E_DB_DIR,
  E2E_DB_PATH,
  MOCK_OIDC_PORT,
  MOCK_WEBHOOK_PORT,
  MOCK_WEBHOOK_STATE_FILE,
} from "./constants";

let oidcServer: MockOidcServer | null = null;
let webhookServer: MockWebhookServer | null = null;

export default async function globalSetup() {
  // The DB directory is wiped + recreated synchronously in
  // playwright.config.ts so the backend (which starts before globalSetup)
  // has a writable dir at boot. We only need to make sure it exists here.
  const abs = path.resolve(E2E_DB_DIR);
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(abs, { recursive: true });
  }

  oidcServer = await startMockOidcServer({ port: MOCK_OIDC_PORT });
  webhookServer = await startMockWebhookServer(MOCK_WEBHOOK_PORT);

  // Persist webhook URL so test workers (which run in separate processes)
  // can discover the mock listener.
  fs.writeFileSync(
    path.resolve(MOCK_WEBHOOK_STATE_FILE),
    JSON.stringify({ url: webhookServer.url, port: webhookServer.port })
  );

  process.env.E2E_OIDC_ISSUER_URL = oidcServer.url;
  process.env.E2E_DB_PATH = path.resolve(E2E_DB_PATH);

  // Stash references so globalTeardown can clean up.
  const storage = globalThis as unknown as {
    __e2eServers?: { oidcServer: MockOidcServer | null; webhookServer: MockWebhookServer | null };
  };
  storage.__e2eServers = { oidcServer, webhookServer };
}
