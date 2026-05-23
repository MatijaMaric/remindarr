import { BasePage } from "./base-page";

/**
 * Login page. Handles the OIDC/passkey toggle that hides the username form
 * when an external auth provider is configured.
 *
 * Non-DOM note: the username form is hidden by default when the backend reports
 * a configured OIDC provider — `signIn` clicks through the toggle automatically.
 */
export class LoginPage extends BasePage {
  async gotoLogin(): Promise<void> {
    await this.goto("/login");
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.gotoLogin();
    const usernameField = this.page.getByLabel("Username");
    if (!(await usernameField.isVisible().catch(() => false))) {
      await this.page
        .getByRole("button", { name: /sign in with username instead/i })
        .click();
    }
    await this.page.getByLabel("Username").fill(username);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: /^sign in$/i }).click();
    await this.page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
  }
}
