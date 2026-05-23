import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class ReelsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/reels");
  }

  /** The "Coming Soon" source chip button. */
  comingSoonChip() {
    return this.page.getByRole("button", { name: "Coming Soon" });
  }

  /** The "Popular" source chip button. */
  popularChip() {
    return this.page.getByRole("button", { name: "Popular" });
  }

  /** The "Friends Loved" source chip button. */
  friendsLovedChip() {
    return this.page.getByRole("button", { name: "Friends Loved" });
  }

  /** The "Mark as Watched" button on the current card. */
  markWatchedButton() {
    return this.page.getByRole("button", { name: "Mark as Watched" });
  }

  /** The "Undo" button in the undo bar. */
  undoButton() {
    return this.page.getByRole("button", { name: "Undo" });
  }

  /** The main navigation element. */
  mainNav() {
    return this.page.getByRole("navigation", { name: "Main navigation" });
  }
}
