import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Stats page POM.
 *
 * Non-DOM notes:
 * - Stats are accessed via the Tracked page at /tracked by clicking the
 *   "Stats" Pill button. The route /stats redirects to /tracked?view=stats
 *   but TrackedPage does NOT read the ?view=stats query param — the pill
 *   must be clicked to switch views.
 * - TrackedPage calls GET /api/track on mount (getTrackedTitles).
 * - StatsView calls GET /api/stats when mounted (after clicking the pill).
 * - The app shell background components (AchievementToast, SuggestedForYouRow,
 *   AuthContext.getSubscriptions) call additional endpoints that must be mocked
 *   to prevent auth:unauthorized events from logging the test user out.
 */
export class StatsPage extends BasePage {
  async gotoTracked(): Promise<void> {
    await this.goto("/tracked");
  }

  /**
   * Click the "Stats" pill on the Tracked page to switch to the stats view.
   * Call gotoTracked() and wait for the page to load before calling this.
   */
  async clickStatsPill(): Promise<void> {
    await this.page.getByRole("button", { name: /^Stats$/i }).click();
  }

  /**
   * Stub all endpoints needed for an authenticated visit to /tracked,
   * excluding GET /api/stats and GET /api/track which tests set up themselves.
   * Call before navigating. Register stats/track mocks AFTER this call so
   * they win (Playwright applies routes LIFO).
   */
  async mockTrackedShellEndpoints(): Promise<void> {
    // AuthContext calls getSubscriptions() after auth succeeds.
    await this.page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    // AchievementToast polls /api/achievements/me in the background.
    await this.page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: [] }),
    );
    // SuggestedForYouRow is always rendered on HomePage, but not on TrackedPage.
    // Still safe to stub in case any lazy-loaded component requests it.
    await this.page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], bySource: {} } }),
    );
    // RecommendationsCount badge in the nav shell calls /api/recommendations/count.
    // Without this mock it returns 401 and fires auth:unauthorized.
    await this.page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
  }

  statsHeading() {
    return this.page.getByText("Stats").first();
  }

  overviewCard(label: string) {
    return this.page.getByText(label);
  }

  sectionHeading(name: string) {
    return this.page.getByText(name);
  }
}

// ── Standard stats fixture ────────────────────────────────────────────────────

export const MOCK_STATS_FULL = {
  overview: {
    watched_movies: 12,
    watched_episodes: 84,
    tracked_shows: 5,
    tracked_movies: 7,
    watch_time_minutes: 3720,
    watch_time_minutes_shows: 1260,
    watch_time_minutes_movies: 2460,
  },
  genres: [
    { genre: "Drama", count: 30 },
    { genre: "Action", count: 18 },
  ],
  languages: [
    { language: "en", count: 45 },
    { language: "ja", count: 10 },
  ],
  monthly: [{ month: "2026-05", movies_watched: 3, episodes_watched: 12 }],
  shows_by_status: {
    watching: 3,
    caught_up: 1,
    not_started: 0,
    completed: 1,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
    unreleased: 0,
  },
  pace: {
    minutesPerDay: 62,
    watchlistEtaDays: 14,
  },
};

export const MOCK_STATS_EMPTY = {
  overview: {
    watched_movies: 0,
    watched_episodes: 0,
    tracked_shows: 0,
    tracked_movies: 0,
    watch_time_minutes: 0,
    watch_time_minutes_shows: 0,
    watch_time_minutes_movies: 0,
  },
  genres: [],
  languages: [],
  monthly: [],
  shows_by_status: {
    watching: 0,
    caught_up: 0,
    not_started: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
    plan_to_watch: 0,
    unreleased: 0,
  },
  pace: {
    minutesPerDay: 0,
    watchlistEtaDays: null,
  },
};
