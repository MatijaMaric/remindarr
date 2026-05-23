import type { Page } from "@playwright/test";

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async waitForVisible(locator: ReturnType<Page["getByRole"]>): Promise<void> {
    await locator.waitFor({ state: "visible" });
  }
}
