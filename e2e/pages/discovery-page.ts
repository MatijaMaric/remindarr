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

  activityTab() {
    return this.page.getByRole("button", { name: /Activity/i });
  }

  forYouTab() {
    return this.page.getByRole("button", { name: "For you" });
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
