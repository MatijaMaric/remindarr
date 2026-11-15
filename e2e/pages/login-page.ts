import { BasePage } from "./base-page";

/**
 * Login page. The username form is always shown; passkey and OIDC buttons sit
 * below it when the backend reports them.
 */
export class LoginPage extends BasePage {
  async gotoLogin(): Promise<void> {
    await this.goto("/login");
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.gotoLogin();
    await this.page.getByLabel("Username").fill(username);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: /^sign in$/i }).click();
    await this.page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
  }
}
