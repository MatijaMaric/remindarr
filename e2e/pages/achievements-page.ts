import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Achievements page POM.
 *
 * Non-DOM notes:
 * - AchievementsPage at /achievements calls GET /api/achievements/me.
 * - AchievementDetailPage at /achievements/:key calls GET /api/achievements/:key/me.
 * - AchievementToast in the app shell also polls GET /api/achievements/me —
 *   mocking it here satisfies both the page query and the background poll.
 * - App shell endpoints (subscriptions, recommendations/count) must be mocked
 *   to prevent auth:unauthorized logout events.
 * - The "Achievements" text is rendered as a Kicker component (not a heading role).
 */
export class AchievementsPage extends BasePage {
  async gotoAchievements(): Promise<void> {
    await this.goto("/achievements");
  }

  async gotoAchievementDetail(key: string): Promise<void> {
    await this.goto(`/achievements/${key}`);
  }

  /**
   * Stub all shell endpoints needed for authenticated visits to achievements pages.
   * Does NOT mock /api/achievements/me or detail endpoints — tests register those.
   */
  async mockAchievementsShellEndpoints(): Promise<void> {
    await this.page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await this.page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await this.page.route("**/api/suggestions**", (route) =>
      route.fulfill({ json: { flat: [], bySource: {} } }),
    );
  }

  pageKicker() {
    return this.page.getByText("Achievements").first();
  }
}

// ── Achievement fixtures ──────────────────────────────────────────────────────

export const MOCK_ACHIEVEMENT_EARNED = {
  key: "first_movie",
  kind: "count_movies",
  title: "First Watch",
  description: "Watch your first movie",
  icon: "Film",
  threshold: 1,
  points: 10,
  progress: 1,
  earned: true,
  earnedAt: "2024-03-01T12:00:00Z",
  category: "watching",
  tier: "one-shot",
  repeatable: false,
  family: null,
  rungIndex: null,
  earnedCount: 1,
  lastEarnedAt: "2024-03-01T12:00:00Z",
  nextRung: null,
  rarity: null,
};

export const MOCK_ACHIEVEMENT_LOCKED = {
  key: "watch_10",
  kind: "count_movies",
  title: "Binge Starter",
  description: "Watch 10 movies",
  icon: "Film",
  threshold: 10,
  points: 25,
  progress: 3,
  earned: false,
  earnedAt: null,
  category: "watching",
  tier: "one-shot",
  repeatable: false,
  family: null,
  rungIndex: null,
  earnedCount: 0,
  lastEarnedAt: null,
  nextRung: null,
  rarity: null,
};

export const MOCK_ACHIEVEMENT_DETAIL_LOCKED = {
  ...MOCK_ACHIEVEMENT_LOCKED,
  rarity: { bucket: "Rare", pct: 12 },
  ladder: null,
  history: [],
};
