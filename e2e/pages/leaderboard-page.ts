import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

/**
 * Leaderboard page POM.
 *
 * Non-DOM notes:
 * - LeaderboardPage at /leaderboard calls GET /api/leaderboard.
 * - The podium reorders entries for visual display: 2nd left, 1st center, 3rd right.
 * - Current user's podium card has amber border/bg; list row also has amber styling.
 * - Empty state condition: entries.length <= 1 (not just 0).
 * - App shell endpoints must be mocked to prevent auth:unauthorized logout events.
 */
export class LeaderboardPage extends BasePage {
  async gotoLeaderboard(): Promise<void> {
    await this.goto("/leaderboard");
  }

  /**
   * Stub all shell endpoints needed for authenticated visits to the leaderboard page.
   * Does NOT mock /api/leaderboard — tests register that themselves.
   */
  async mockLeaderboardShellEndpoints(): Promise<void> {
    await this.page.route("**/api/user/settings/subscriptions**", (route) =>
      route.fulfill({ json: { providerIds: [] } }),
    );
    await this.page.route("**/api/recommendations/count**", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await this.page.route("**/api/achievements/me**", (route) =>
      route.fulfill({ json: { achievements: [] } }),
    );
  }

  pageHeading() {
    return this.page.getByRole("heading", { name: /leaderboard/i });
  }
}

// ── Leaderboard fixtures ──────────────────────────────────────────────────────

export const MOCK_LEADERBOARD_FOUR_ENTRIES = {
  entries: [
    {
      userId: "user-2",
      username: "alice",
      name: "Alice",
      image: null,
      xp: 500,
      badgeCount: 3,
      rank: 1,
    },
    {
      userId: "user-3",
      username: "bob",
      name: "Bob",
      image: null,
      xp: 420,
      badgeCount: 2,
      rank: 2,
    },
    {
      userId: "user-4",
      username: "charlie",
      name: "Charlie",
      image: null,
      xp: 310,
      badgeCount: 1,
      rank: 3,
    },
    {
      userId: "user-5",
      username: "diana",
      name: "Diana",
      image: null,
      xp: 200,
      badgeCount: 0,
      rank: 4,
    },
  ],
};

export const MOCK_LEADERBOARD_WITH_ME = {
  entries: [
    {
      userId: "user-2",
      username: "alice",
      name: "Alice",
      image: null,
      xp: 600,
      badgeCount: 4,
      rank: 1,
    },
    {
      userId: "user-1",
      username: "testuser",
      name: "Test User",
      image: null,
      xp: 500,
      badgeCount: 3,
      rank: 2,
    },
    {
      userId: "user-3",
      username: "bob",
      name: "Bob",
      image: null,
      xp: 400,
      badgeCount: 2,
      rank: 3,
    },
    {
      userId: "user-4",
      username: "charlie",
      name: "Charlie",
      image: null,
      xp: 200,
      badgeCount: 0,
      rank: 4,
    },
  ],
};
