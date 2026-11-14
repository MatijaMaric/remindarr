/**
 * Reels is the default Home view on phones: `/` redirects signed-in mobile
 * users to `/reels`. Links that mean "the dashboard, not Reels" carry this
 * router state so `HomeRoute` renders the dashboard instead of redirecting.
 * It lives in history state, so reload and back/forward keep the dashboard.
 */
export const HOME_DASHBOARD_STATE = { dashboard: true } as const;

export function wantsDashboard(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { dashboard?: unknown }).dashboard === true
  );
}
