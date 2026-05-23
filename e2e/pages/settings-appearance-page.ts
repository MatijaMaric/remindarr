import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsAppearancePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoAppearance(): Promise<void> {
    await super.goto("/settings?tab=appearance");
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  themeSection() {
    return this.page.getByText("Theme", { exact: true }).first();
  }

  accentSection() {
    return this.page.getByText("Accent Color", { exact: true }).first();
  }

  displayPrefsSection() {
    return this.page.getByText("Display Preferences", { exact: true }).first();
  }

  homepageLayoutSection() {
    return this.page.getByText("Homepage Layout", { exact: true }).first();
  }

  crowdedWeekSection() {
    return this.page
      .getByText("Crowded Week Detection", { exact: true })
      .first();
  }
}
