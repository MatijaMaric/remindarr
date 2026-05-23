import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class MorePagePO extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoMore(): Promise<void> {
    await super.goto("/more");
  }

  profileCard() {
    return this.page.getByRole("link", { name: /testuser/i }).first();
  }

  signOutButton() {
    return this.page.getByRole("button", { name: /sign out/i });
  }
}
