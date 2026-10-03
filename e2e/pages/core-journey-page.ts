import { expect } from "@playwright/test";
import { BasePage } from "./base-page";

export class CoreJourneyPage extends BasePage {
  async signup() {
    await this.goto("/signup");
    const username = `journey_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    await this.page.getByLabel("Username", { exact: true }).fill(username);
    await this.page
      .getByLabel("Email", { exact: true })
      .fill(`${username}@example.com`);
    await this.page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-password-123");
    await this.page
      .getByRole("button", { name: /sign up|create account/i })
      .click();
    await expect(this.page).toHaveURL("/");
  }
  async search() {
    await this.goto("/browse");
    await this.page
      .getByRole("textbox", { name: /search/i })
      .fill("Synthetic Journey");
    await this.page
      .getByRole("button", { name: "Search", exact: true })
      .click();
    await this.page
      .getByRole("link", { name: /Synthetic Journey/ })
      .first()
      .click();
    await expect(
      this.page
        .getByRole("heading", { name: "Synthetic Journey", exact: true })
        .first(),
    ).toBeVisible();
  }
  async library() {
    await this.page
      .getByRole("link", { name: "Tracked", exact: true })
      .first()
      .click();
  }
}
