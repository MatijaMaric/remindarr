import type { Page } from "@playwright/test";
import { BasePage } from "./base-page";

export class AdminUsersPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoAdminUsers(): Promise<void> {
    await super.goto("/admin/users");
  }

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  searchInput() {
    return this.page.getByRole("textbox", {
      name: /search by username or name/i,
    });
  }

  backToSettingsLink() {
    return this.page.getByRole("link", { name: /back to settings/i });
  }

  /** Row for a given username — finds the username cell in the table */
  userRow(username: string) {
    return this.page.getByRole("row").filter({ hasText: username });
  }

  promoteButton(username: string) {
    return this.userRow(username).getByRole("button", {
      name: /promote to admin/i,
    });
  }

  demoteButton(username: string) {
    return this.userRow(username).getByRole("button", {
      name: /demote to user/i,
    });
  }

  banButton(username: string) {
    return this.userRow(username).getByRole("button", { name: /ban user/i });
  }

  deleteButton(username: string) {
    return this.userRow(username).getByRole("button", { name: /delete user/i });
  }

  /** Confirmation dialog delete button */
  confirmDeleteButton() {
    return this.page.getByRole("button", { name: /delete permanently/i });
  }

  /** Confirmation dialog ban button */
  confirmBanButton() {
    return this.page.getByRole("button", { name: /ban user/i }).last();
  }
}
