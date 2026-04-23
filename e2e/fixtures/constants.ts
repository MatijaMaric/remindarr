/**
 * Shared constants used across e2e specs, fixtures, and playwright config.
 * Ports are fixed so the backend webServer can point OIDC config at the mock
 * before tests run.
 */
export const MOCK_OIDC_PORT = 4321;
export const MOCK_WEBHOOK_PORT = 4322;
export const MOCK_OIDC_URL = `http://127.0.0.1:${MOCK_OIDC_PORT}`;
export const MOCK_WEBHOOK_URL = `http://127.0.0.1:${MOCK_WEBHOOK_PORT}`;

export const E2E_DB_DIR = ".e2e";
export const E2E_DB_PATH = `${E2E_DB_DIR}/remindarr.sqlite`;
export const MOCK_WEBHOOK_STATE_FILE = `${E2E_DB_DIR}/webhook.json`;

/**
 * The redirect URI better-auth's generic-oauth plugin uses by default is
 * `${baseURL}/oauth2/callback/${providerId}`. Our providerId is "pocketid"
 * and baseURL is the backend's BASE_URL (set to the frontend origin so the
 * browser-observable callback is correct).
 */
export const OIDC_PROVIDER_ID = "pocketid";
