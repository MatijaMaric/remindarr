import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class DiscoveryPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/discovery");
  }

  heading() {
    return this.page.getByRole("heading", {
      name: "For you",
      level: 1,
      exact: true,
    });
  }

  /**
   * "Friends are recommending" row. Since #1421 there is no Activity tab:
   * received recommendations live in this row on the single For you view.
   */
  friendsRow() {
    return this.section("Friends are recommending");
  }

  /** A content row (<section>) identified by its <h2> title. */
  section(title: string) {
    return this.page.locator("section").filter({
      has: this.page.getByRole("heading", { name: title, level: 2 }),
    });
  }

  /**
   * Discovery link in the desktop top nav. The unread recommendation count
   * moved here (and to the More page) when the Activity tab was removed; its
   * accessible name includes "N unread recommendations".
   */
  discoveryNavLink() {
    return this.page
      .getByRole("navigation")
      .getByRole("link", { name: /^Discovery/ });
  }

  heroTitle(name: string) {
    return this.page.getByRole("heading", { name, level: 2 });
  }

  /** The Track/Tracked button on the hero card (always the first Track button on the page). */
  trackButton() {
    return this.page.getByRole("button", { name: "Track" }).first();
  }

  viewDetailsLink() {
    return this.page.getByRole("link", { name: "View details" });
  }
}
