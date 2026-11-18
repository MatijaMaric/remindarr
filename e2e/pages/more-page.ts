import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class MorePagePO extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoMore(): Promise<void> {
    await super.goto("/more");
  }

  profileCard(username = "testuser") {
    // The card link's name is "<initials> <display name> @<username>".
    return this.page
      .getByRole("link", { name: new RegExp(`@${username}$`, "i") })
      .first();
  }

  signOutButton() {
    return this.page.getByRole("button", { name: /sign out/i });
  }
}
