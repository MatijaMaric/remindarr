import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class InvitePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoInvite(): Promise<void> {
    await super.goto("/invite");
  }

  async gotoInviteWithCode(code: string): Promise<void> {
    await super.goto(`/invite?code=${code}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  createButton() {
    return this.page.getByRole("button", { name: /create invite link/i });
  }

  emptyState() {
    return this.page.getByText(/no invitations yet/i);
  }

  redeemBanner() {
    return this.page.locator(".bg-green-900\\/20");
  }

  errorBanner() {
    return this.page.locator(".bg-red-900\\/20");
  }
}
