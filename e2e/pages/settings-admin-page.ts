import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsAdminPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoAdminTab(): Promise<void> {
    await super.goto("/settings?tab=admin");
  }

  backgroundJobsSection() {
    return this.page.getByText("Background jobs").first();
  }

  oidcSection() {
    return this.page.getByText("OpenID Connect").first();
  }

  runtimeConfigSection() {
    return this.page.getByText("Runtime configuration").first();
  }

  serverLogsSection() {
    return this.page.getByText("Server logs").first();
  }

  maintenanceSection() {
    return this.page.getByText("Maintenance").first();
  }

  manageUsersLink() {
    return this.page.getByRole("link", { name: /manage users/i });
  }

  saveOidcButton() {
    return this.page.getByRole("button", { name: /save oidc settings/i });
  }
}
