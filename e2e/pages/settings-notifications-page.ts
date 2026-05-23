import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsNotificationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoNotifications(): Promise<void> {
    await super.goto("/settings?tab=notifications");
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  notifiersSection() {
    return this.page.getByText("Notifiers", { exact: true }).first();
  }

  addNotifierButton() {
    return this.page.getByRole("button", { name: /add notifier/i });
  }
}
