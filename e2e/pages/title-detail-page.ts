import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class TitleDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(titleId: string): Promise<void> {
    await super.goto(`/title/${titleId}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  /** Track/Tracked toggle button. */
  trackButton() {
    return this.page.getByRole("button", { name: /^Track$/i });
  }

  trackedButton() {
    return this.page.getByRole("button", { name: /^Tracked$/i });
  }

  /** Confirm untrack button inside the AlertDialog. */
  confirmUntrackButton() {
    return this.page.getByRole("button", { name: /Confirm/i });
  }

  /** Seasons section heading (shows only). */
  seasonsHeading() {
    return this.page.getByRole("heading", { name: "Seasons", level: 2 });
  }
}
