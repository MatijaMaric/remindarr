import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SharedWatchlistPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoWatchlist(token: string): Promise<void> {
    await super.goto(`/share/watchlist/${token}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  errorHeading() {
    return this.page.getByText("This link is invalid or has been revoked", {
      exact: true,
    });
  }

  emptyState() {
    return this.page.getByText("This watchlist is empty", { exact: true });
  }

  poweredByLink() {
    return this.page.getByRole("link", { name: "Remindarr" }).last();
  }

  goToRemindarrLink() {
    return this.page.getByRole("link", { name: "Go to Remindarr" });
  }
}
