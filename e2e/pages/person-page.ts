import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class PersonPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(personId: number | string = 287): Promise<void> {
    await super.goto(`/person/${personId}`);
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  /** Section heading for acting credits, e.g. "Acting (2)". */
  actingHeading() {
    return this.page.getByRole("heading", { name: /Acting/i });
  }

  /** Section heading for crew credits, e.g. "Crew (1)". */
  crewHeading() {
    return this.page.getByRole("heading", { name: /Crew/i });
  }

  biographyHeading() {
    return this.page.getByRole("heading", { name: "Biography" });
  }

  showMoreButton() {
    return this.page.getByRole("button", { name: "Show more" });
  }

  showLessButton() {
    return this.page.getByRole("button", { name: "Show less" });
  }

  /** Link to a credit title by partial name match. */
  creditLink(name: string) {
    return this.page.getByRole("link", { name: new RegExp(name, "i") }).first();
  }
}
