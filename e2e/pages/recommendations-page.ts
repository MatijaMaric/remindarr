import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class RecommendationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoDiscovery(): Promise<void> {
    await super.goto("/discovery");
  }

  async gotoTitle(titleId: string): Promise<void> {
    await super.goto(`/title/${titleId}`);
  }

  forYouHeading() {
    return this.page.getByRole("heading", { name: "For you" });
  }

  /**
   * "Friends are recommending" row on /discovery — where received
   * recommendations are listed since the Activity tab was removed (#1421).
   */
  friendsRow() {
    return this.page.locator("section").filter({
      has: this.page.getByRole("heading", {
        name: "Friends are recommending",
        level: 2,
      }),
    });
  }

  /** Recommend button on a title detail page. */
  recommendButton() {
    return this.page.getByRole("button", { name: "Recommend", exact: true });
  }

  recommendedButton() {
    return this.page.getByRole("button", { name: "Recommended", exact: true });
  }

  recommendDialogHeading() {
    return this.page.getByRole("heading", { name: "Recommend this title" });
  }

  audienceAllButton() {
    return this.page.locator('[data-testid="audience-all"]');
  }

  recommendMessageInput() {
    return this.page.locator('[data-testid="recommend-message"]');
  }

  sendButton() {
    return this.page.locator('[data-testid="recommend-send"]');
  }
}
