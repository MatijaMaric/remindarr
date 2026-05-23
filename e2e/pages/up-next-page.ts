import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class UpNextPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoHome(): Promise<void> {
    await super.goto("/");
  }

  upNextHeading() {
    return this.page.getByText("Up Next", { exact: true });
  }

  markWatchedButton() {
    return this.page.getByRole("button", { name: "Mark Watched" }).first();
  }
}
