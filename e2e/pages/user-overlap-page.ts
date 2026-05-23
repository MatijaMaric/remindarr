import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class UserOverlapPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoOverlap(username: string, friendUsername: string): Promise<void> {
    await super.goto(`/u/${username}/overlap/${friendUsername}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  filterAll() {
    return this.page.getByRole("button", { name: "All", exact: true });
  }

  filterMoviesOnly() {
    return this.page.getByRole("button", { name: "Movies only", exact: true });
  }

  filterWatchableNow() {
    return this.page.getByRole("button", {
      name: "Watchable now",
      exact: true,
    });
  }

  backToProfileLink(friendUsername: string) {
    return this.page.getByRole("link", {
      name: new RegExp(`Back to profile`, "i"),
    });
  }
}
