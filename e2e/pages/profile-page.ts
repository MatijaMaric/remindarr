import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class ProfilePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoUser(username: string): Promise<void> {
    await super.goto(`/user/${username}`);
  }

  async gotoProfile(): Promise<void> {
    await super.goto("/profile");
  }

  profileHero() {
    return this.page.locator('[data-testid="profile-hero"]');
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  /** The "@username" text in the hero. */
  usernameLabel(username: string) {
    return this.page.getByText(`@${username}`);
  }

  socialBar() {
    return this.page.locator('[data-testid="social-bar"]');
  }

  /** Follow / Following button in the hero. */
  followButton() {
    return this.page.getByRole("button", { name: /^Follow$/i });
  }

  followingOrUnfollowButton() {
    return this.page
      .getByRole("button", { name: /Following|Unfollow/i })
      .first();
  }

  /** "Watch together" sidebar link. */
  watchTogetherLink() {
    return this.page.getByRole("link", { name: /Watch together/i });
  }

  /** Achievements kicker label. */
  achievementsKicker() {
    return this.page.getByText("Achievements", { exact: true });
  }

  viewAllAchievementsLink() {
    return this.page.getByRole("link", { name: /View all achievements/i });
  }

  progressKicker() {
    return this.page.getByText("Progress");
  }
}
