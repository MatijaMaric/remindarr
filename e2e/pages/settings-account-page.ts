import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsAccountPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoSettings(): Promise<void> {
    await super.goto("/settings");
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  visibilitySelector() {
    return this.page.locator('[data-testid="visibility-selector"]');
  }

  activityToggle() {
    return this.page.getByRole("switch", { name: /show activity on profile/i });
  }

  inviteLink() {
    return this.page.getByRole("link", { name: /invite/i }).first();
  }
}
