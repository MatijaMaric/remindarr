/**
 * Web-push helpers for e2e tests.
 *
 * Browser-side push notifications require:
 *   1. The `notifications` permission to be granted up-front.
 *   2. A service worker with a Push subscription — not possible in Playwright
 *      without a real VAPID key exchange. Instead, specs that test the
 *      notification UI (enable/disable toggles, provider settings) should use
 *      the API route-mock path rather than end-to-end push delivery.
 *
 * Use `grantNotificationsPermission` in a `test.use({ ... })` block or
 * directly in a `beforeEach` to pre-grant the permission so the browser
 * does not show a permission prompt during the test.
 */
import type { BrowserContext } from "@playwright/test";

/**
 * Grants the `notifications` permission on the given context.
 *
 * Call from a fixture or `test.beforeEach` before navigating to any page that
 * triggers a permission prompt. The origin must match the app's base URL.
 *
 * @example
 * test.beforeEach(async ({ context }) => {
 *   await grantNotificationsPermission(context, "http://localhost:5173");
 * });
 */
export async function grantNotificationsPermission(
  context: BrowserContext,
  origin = "http://localhost:5173",
): Promise<void> {
  await context.grantPermissions(["notifications"], { origin });
}

/**
 * Revokes the `notifications` permission, restoring prompt behaviour.
 * Useful in `afterEach` when a test explicitly checks the denied state.
 */
export async function revokeNotificationsPermission(
  context: BrowserContext,
): Promise<void> {
  await context.clearPermissions();
}
