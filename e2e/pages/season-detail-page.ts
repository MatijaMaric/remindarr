import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class SeasonDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(titleId: string, season: number): Promise<void> {
    await super.goto(`/title/${titleId}/season/${season}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  episodesHeading() {
    return this.page.getByRole("heading", { name: /Episodes/i, level: 2 });
  }

  /** Breadcrumb link back to the show title page. */
  showBreadcrumb(showTitle: string) {
    return this.page.getByRole("link", { name: showTitle }).first();
  }

  markAllWatchedButton() {
    return this.page.getByRole("button", {
      name: "Mark all watched",
      exact: true,
    });
  }

  markAllUnwatchedButton() {
    return this.page.getByRole("button", {
      name: "Mark all unwatched",
      exact: true,
    });
  }
}
