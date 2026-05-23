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

  activityTab() {
    // Button text includes an optional unread count badge, e.g. "Activity 1"
    return this.page.getByRole("button", { name: /^Activity/ });
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
