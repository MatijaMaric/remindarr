import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class WatchedRatingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoTracked(): Promise<void> {
    await super.goto("/tracked");
  }

  heading() {
    return this.page.getByRole("heading", { name: "Tracked" });
  }

  /** The kicker above the heading, e.g. "Your library · 1 title". */
  kicker() {
    return this.page.locator(".font-mono").filter({ hasText: /Your library/ });
  }

  statsCard(label: string) {
    return this.page.getByText(label, { exact: true });
  }
}
