import type { Locator, Page } from "@playwright/test";
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

  /**
   * Share button on a pending invitation card. Since #1428 the card does not
   * print the code; Share hands out the full /invite?code=… link.
   */
  shareButton() {
    return this.page.getByRole("button", { name: "Share", exact: true });
  }

  /**
   * Replace navigator.share with a recorder so the shared URL can be read back
   * via window.__sharedUrls. Must be called before navigation.
   */
  async captureShares(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as unknown as { __sharedUrls: string[] };
      w.__sharedUrls = [];
      navigator.share = async (data?: ShareData) => {
        w.__sharedUrls.push(data?.url ?? "");
      };
    });
  }

  async sharedUrls(): Promise<string[]> {
    return this.page.evaluate(
      () => (window as unknown as { __sharedUrls: string[] }).__sharedUrls,
    );
  }

  /**
   * The invitation card containing `inner`. Cards have no role or label, so
   * this takes the nearest rounded card ancestor; only for style assertions.
   */
  invitationCardWith(inner: Locator) {
    return this.page.locator("div.rounded-md").filter({ has: inner }).last();
  }

  emptyState() {
    return this.page.getByText(/no invitations yet/i);
  }

  /**
   * In-page redeem result banner. The same text is also toasted, but the
   * Toaster renders outside <main>, so scoping to main picks the banner only.
   */
  redeemBanner() {
    return this.page
      .getByRole("main")
      .getByText(/are now following each other/i);
  }

  /** In-page error banner showing the server's error message. */
  errorBanner(message: string | RegExp) {
    return this.page.getByRole("main").getByText(message);
  }
}
