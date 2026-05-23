import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsIntegrationsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoIntegrationsTab(): Promise<void> {
    await super.goto("/settings?tab=integrations");
  }

  plexSection() {
    return this.page.getByText("Plex").first();
  }

  connectPlexButton() {
    return this.page.getByRole("button", { name: /connect plex/i });
  }

  disconnectButton() {
    return this.page.getByRole("button", { name: /disconnect/i });
  }

  syncNowButton() {
    return this.page.getByRole("button", { name: /sync now/i });
  }

  disableButton() {
    return this.page.getByRole("button", { name: /^disable$/i });
  }

  cancelConnectButton() {
    return this.page.getByRole("button", { name: /^cancel$/i });
  }

  openAuthLink() {
    return this.page.getByRole("link", { name: /open authorization page/i });
  }
}
