import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsSubscriptionsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoSubscriptions(): Promise<void> {
    await super.goto("/settings?tab=subscriptions");
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  subscriptionsCard() {
    return this.page
      .getByText("My Streaming Services", { exact: true })
      .first();
  }

  regionGroupHeader() {
    return this.page.getByText("My Region", { exact: true }).first();
  }

  otherGroupHeader() {
    return this.page.getByText("Other", { exact: true }).first();
  }

  onlyMineToggle() {
    return this.page.getByRole("switch", {
      name: /only show titles on my services/i,
    });
  }
}
